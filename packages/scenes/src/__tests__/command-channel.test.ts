import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Command } from '@scenetest/protocol'
import { createCommandFileReader, watchCommandFile } from '../command-channel.js'

const tmpFiles: string[] = []
const stoppers: Array<() => void> = []

afterEach(() => {
  for (const stop of stoppers.splice(0)) stop()
  for (const file of tmpFiles.splice(0)) {
    try {
      fs.rmSync(file)
    } catch {
      /* ignore */
    }
  }
})

function tmpPath(): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-cmd-')), 'commands.jsonl')
  tmpFiles.push(p)
  return p
}

// The line-parsing/offset logic is tested deterministically by driving poll()
// directly — no dependence on real filesystem-watch scheduling, which starves
// under the parallel test run. A separate smoke test covers the watch wiring.
describe('createCommandFileReader', () => {
  it('processes complete lines already present before the first poll', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '{"type":"run:pause"}\n{"type":"run:resume"}\n')

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))
    poll()

    expect(seen.map((c) => c.type)).toEqual(['run:pause', 'run:resume'])
  })

  it('tails appended lines across polls, advancing by byte offset', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '')

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))
    poll()
    expect(seen).toHaveLength(0)

    fs.appendFileSync(file, '{"type":"run:stop"}\n')
    poll()
    expect(seen).toEqual([{ type: 'run:stop' }])

    fs.appendFileSync(file, '{"type":"run:replay","file":"a.spec.ts"}\n')
    poll()
    expect(seen).toEqual([{ type: 'run:stop' }, { type: 'run:replay', file: 'a.spec.ts' }])
  })

  it('buffers a partial trailing line until its newline arrives', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '')

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))

    fs.appendFileSync(file, '{"type":"run:')
    poll()
    expect(seen).toHaveLength(0)

    fs.appendFileSync(file, 'pause"}\n')
    poll()
    expect(seen).toEqual([{ type: 'run:pause' }])
  })

  it('skips malformed, unknown, and blank lines without throwing', () => {
    const file = tmpPath()
    fs.writeFileSync(file, 'not json\n{"type":"run:explode"}\n\n{"type":"run:pause"}\n')

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))
    poll()

    expect(seen).toEqual([{ type: 'run:pause' }])
  })

  it('is a no-op until the file exists, then picks it up', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-cmd-'))
    const file = path.join(dir, 'later.jsonl')
    tmpFiles.push(file)

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))
    poll() // file absent — must not throw
    expect(seen).toHaveLength(0)

    fs.writeFileSync(file, '{"type":"run:resume"}\n')
    poll()
    expect(seen).toEqual([{ type: 'run:resume' }])
  })

  it('re-reads from the top when the file shrinks (truncate/rotate)', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '{"type":"run:pause"}\n')

    const seen: Command[] = []
    const poll = createCommandFileReader(file, (c) => seen.push(c))
    poll()
    expect(seen).toHaveLength(1)

    // Rotate: a smaller file with a fresh command.
    fs.writeFileSync(file, '{"type":"run:stop"}\n')
    poll()
    expect(seen).toEqual([{ type: 'run:pause' }, { type: 'run:stop' }])
  })
})

describe('watchCommandFile (watch wiring)', () => {
  // Live-append detection latency is `fs.watchFile`'s behavior, not ours (and
  // its poll starves under the parallel test run), so we assert only the parts
  // we own deterministically: the synchronous initial drain and clean detach.
  it('drains pre-existing lines synchronously at attach', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '{"type":"run:pause"}\n{"type":"run:resume"}\n')

    const seen: Command[] = []
    const stop = watchCommandFile(file, (c) => seen.push(c), { interval: 20 })
    stoppers.push(stop)

    // The constructor calls poll() synchronously, so anything already present
    // is dispatched before watchCommandFile returns — no waiting required.
    expect(seen.map((c) => c.type)).toEqual(['run:pause', 'run:resume'])
  })

  it('returns a stop function that detaches cleanly and is idempotent', () => {
    const file = tmpPath()
    fs.writeFileSync(file, '')

    const stop = watchCommandFile(file, () => {}, { interval: 20 })
    expect(() => {
      stop()
      stop()
    }).not.toThrow()
  })
})
