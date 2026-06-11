import fs from 'node:fs'
import path from 'node:path'

/**
 * A protocol event as the receiver sees it: the envelope (`type` +
 * `timestamp`) is guaranteed by `isEventShaped`, everything else is
 * passed through untouched. The receiver is a relay — it must not
 * narrow events to the vocabulary it was compiled against, or a newer
 * CLI paired with an older receiver would have its events dropped.
 */
export type SinkEvent = { type: string; timestamp: number } & Record<string, unknown>

/**
 * Destination for received protocol events.
 *
 * `write()` is called once per accepted event. `clear()`, if present,
 * is called when a `run:start` event arrives — consumers that hold
 * live state (ring buffers, dashboards) reset so the new run starts
 * fresh. `clear()` is invoked before the `run:start` event itself is
 * written.
 */
export interface Sink {
  write(event: SinkEvent): void
  clear?(): void
}

/**
 * Sink that appends one JSON line per event to a file — ".jsonl =
 * protocol events, one per line". Lines are `JSON.stringify(event)`
 * (the `encodeEvent()` wire format) followed by `\n`, so known event
 * types round-trip through `decodeEvent()`.
 *
 * The file is opened lazily on first write (parent directories are
 * created as needed) and appended to across runs; call `close()` when
 * done. No `clear()` — the JSONL file is a durable log, not live state.
 */
export class JsonlSink implements Sink {
  private fd: number | null = null

  constructor(private readonly filePath: string) {}

  write(event: SinkEvent): void {
    if (this.fd === null) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      this.fd = fs.openSync(this.filePath, 'a')
    }
    fs.writeSync(this.fd, JSON.stringify(event) + '\n')
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd)
      this.fd = null
    }
  }
}
