import fs from 'node:fs'
import { decodeCommand } from '@scenetest/protocol'
import type { Command } from '@scenetest/protocol'

export interface WatchCommandFileOptions {
  /** `fs.watchFile` poll interval in ms. Default 200. */
  interval?: number
}

/**
 * Stateful reader that tails a JSONL command file by byte offset. Each `poll()`
 * reads what's been appended since the last call and dispatches every complete
 * line decoded as a `Command`. Split from the watch wiring so the read logic is
 * testable without racing filesystem-watch scheduling.
 *
 * Tolerates a not-yet-created file, buffers a partial trailing line until its
 * newline, re-reads from the top on a shrink (truncate/rotate), and skips
 * malformed/unknown lines.
 */
export function createCommandFileReader(
  filePath: string,
  onCommand: (command: Command) => void
): () => void {
  let offset = 0
  let buffer = ''
  let reading = false

  return function poll(): void {
    if (reading) return
    reading = true
    try {
      let stat: fs.Stats
      try {
        stat = fs.statSync(filePath)
      } catch {
        return // not created yet
      }
      if (stat.size < offset) {
        offset = 0 // truncated/rotated — start over
        buffer = ''
      }
      if (stat.size === offset) return

      const length = stat.size - offset
      const chunk = Buffer.alloc(length)
      const fd = fs.openSync(filePath, 'r')
      try {
        fs.readSync(fd, chunk, 0, length, offset)
      } finally {
        fs.closeSync(fd)
      }
      offset = stat.size
      buffer += chunk.toString('utf8')

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const command = decodeCommand(line)
        if (command) onCommand(command)
      }
    } finally {
      reading = false
    }
  }
}

/**
 * Tail a JSONL command file and dispatch each appended `Command` — the inbound
 * mirror of `--report-url`/`JsonlSink`. A driver appends one encoded command
 * per line; this decodes each and calls `onCommand` (typically
 * `RunController.dispatch`). Read-only: never writes the file. Returns a stop
 * function that detaches the watcher.
 */
export function watchCommandFile(
  filePath: string,
  onCommand: (command: Command) => void,
  options: WatchCommandFileOptions = {}
): () => void {
  const interval = options.interval ?? 200
  const poll = createCommandFileReader(filePath, onCommand)
  let closed = false

  const listener = (): void => {
    if (!closed) poll()
  }
  const watcher = fs.watchFile(filePath, { interval }, listener)
  // Don't keep the process alive just for the watcher.
  ;(watcher as { unref?: () => void }).unref?.()

  poll() // anything already present at attach time

  return () => {
    if (closed) return
    closed = true
    fs.unwatchFile(filePath, listener)
  }
}
