import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decodeEvent } from '@scenetest/protocol'
import { JsonlSink } from '../sink.js'

describe('JsonlSink', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-receiver-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('writes one JSON line per event, creating parent directories lazily', async () => {
    const file = path.join(tmp, 'nested', 'dir', 'events.jsonl')
    const sink = new JsonlSink(file)

    // Lazy open: nothing on disk until the first write
    expect(fs.existsSync(path.dirname(file))).toBe(false)

    sink.write({ type: 'run:start', timestamp: 1, sceneCount: 2 })
    sink.write({ type: 'run:progress', timestamp: 2, pct: 50, failing: 0, flaky: 0 })
    sink.close()

    const lines = fs.readFileSync(file, 'utf-8').split('\n')
    expect(lines).toHaveLength(3) // two events + trailing newline
    expect(lines[2]).toBe('')
    expect(JSON.parse(lines[0])).toEqual({ type: 'run:start', timestamp: 1, sceneCount: 2 })
    expect(JSON.parse(lines[1])).toEqual({
      type: 'run:progress',
      timestamp: 2,
      pct: 50,
      failing: 0,
      flaky: 0,
    })
  })

  it('round-trips known event types through decodeEvent()', () => {
    const file = path.join(tmp, 'events.jsonl')
    const sink = new JsonlSink(file)
    const event = { type: 'run:start', timestamp: 42, runId: '42', sceneCount: 7 }
    sink.write(event)
    sink.close()

    const line = fs.readFileSync(file, 'utf-8').trimEnd()
    expect(decodeEvent(line)).toEqual(event)
  })

  it('appends across separate sink instances', () => {
    const file = path.join(tmp, 'events.jsonl')
    const first = new JsonlSink(file)
    first.write({ type: 'run:start', timestamp: 1, sceneCount: 1 })
    first.close()

    const second = new JsonlSink(file)
    second.write({ type: 'run:start', timestamp: 2, sceneCount: 1 })
    second.close()

    const lines = fs.readFileSync(file, 'utf-8').trimEnd().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('close() is safe to call twice and before any write', () => {
    const sink = new JsonlSink(path.join(tmp, 'never.jsonl'))
    sink.close()
    sink.close()
    expect(fs.existsSync(path.join(tmp, 'never.jsonl'))).toBe(false)
  })
})
