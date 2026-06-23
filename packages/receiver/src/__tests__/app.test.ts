import { describe, it, expect } from 'vitest'
import type { Command } from '@scenetest/protocol'
import { createReceiverApp } from '../app.js'
import type { CommandMeta } from '../command.js'
import type { Sink, SinkEvent } from '../sink.js'

function recordingSink(): Sink & { events: SinkEvent[]; cleared: number } {
  const sink = {
    events: [] as SinkEvent[],
    cleared: 0,
    write(event: SinkEvent) {
      sink.events.push(event)
    },
    clear() {
      sink.cleared++
    },
  }
  return sink
}

function post(app: ReturnType<typeof createReceiverApp>, body: string) {
  return app.request('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

describe('createReceiverApp', () => {
  it('writes a valid event to every sink and responds ok:true', async () => {
    const a = recordingSink()
    const b = recordingSink()
    const app = createReceiverApp({ sinks: [a, b] })

    const event = { type: 'assertion', timestamp: 123, description: 'works', result: true }
    const res = await post(app, JSON.stringify(event))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(a.events).toEqual([event])
    expect(b.events).toEqual([event])
    expect(a.cleared).toBe(0)
  })

  it('calls clear() on each sink when run:start arrives, before writing it', async () => {
    const order: string[] = []
    const sink: Sink = {
      write: (e) => order.push(`write:${e.type}`),
      clear: () => order.push('clear'),
    }
    const app = createReceiverApp({ sinks: [sink] })

    await post(app, JSON.stringify({ type: 'assertion', timestamp: 1, result: true }))
    await post(app, JSON.stringify({ type: 'run:start', timestamp: 2, sceneCount: 3 }))

    expect(order).toEqual(['write:assertion', 'clear', 'write:run:start'])
  })

  it('tolerates sinks without clear() on run:start', async () => {
    const events: SinkEvent[] = []
    const app = createReceiverApp({ sinks: [{ write: (e) => events.push(e) }] })

    const res = await post(app, JSON.stringify({ type: 'run:start', timestamp: 1, sceneCount: 0 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(events).toHaveLength(1)
  })

  it('passes through unknown future event types that carry the envelope', async () => {
    const sink = recordingSink()
    const app = createReceiverApp({ sinks: [sink] })

    const future = { type: 'hologram:flicker', timestamp: 999, intensity: 0.7 }
    const res = await post(app, JSON.stringify(future))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sink.events).toEqual([future])
  })

  it('responds 200 ok:false for malformed JSON without writing to sinks', async () => {
    const sink = recordingSink()
    const app = createReceiverApp({ sinks: [sink] })

    const res = await post(app, '{not json')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false })
    expect(sink.events).toEqual([])
  })

  it('responds 200 ok:false for bodies that are not event-shaped', async () => {
    const sink = recordingSink()
    const app = createReceiverApp({ sinks: [sink] })

    for (const body of ['null', '[]', '{"type":"x"}', '{"timestamp":1}', '{"type":1,"timestamp":1}']) {
      const res = await post(app, body)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: false })
    }
    expect(sink.events).toEqual([])
    expect(sink.cleared).toBe(0)
  })
})

function postCommand(app: ReturnType<typeof createReceiverApp>, body: string) {
  return app.request('/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

describe('createReceiverApp — /commands', () => {
  it('decodes a wrapped command and dispatches it to onCommand with runId metadata', async () => {
    const seen: Array<{ command: Command; meta: CommandMeta }> = []
    const app = createReceiverApp({ sinks: [], onCommand: (command, meta) => void seen.push({ command, meta }) })

    const res = await postCommand(app, JSON.stringify({ command: { type: 'run:stop' }, runId: '1700000000000' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(seen).toEqual([{ command: { type: 'run:stop' }, meta: { runId: '1700000000000' } }])
  })

  it('accepts a bare command object (no envelope) and leaves runId undefined', async () => {
    const seen: Array<{ command: Command; meta: CommandMeta }> = []
    const app = createReceiverApp({ sinks: [], onCommand: (command, meta) => void seen.push({ command, meta }) })

    const res = await postCommand(app, JSON.stringify({ type: 'run:replay', file: 'chat.spec.ts' }))

    expect(await res.json()).toEqual({ ok: true })
    expect(seen).toEqual([{ command: { type: 'run:replay', file: 'chat.spec.ts' }, meta: { runId: undefined } }])
  })

  it('acts on the active run without a runId — run-agnostic commands Just Work', async () => {
    const types: string[] = []
    const app = createReceiverApp({ sinks: [], onCommand: (command) => void types.push(command.type) })

    for (const type of ['run:stop', 'run:pause', 'run:resume']) {
      const res = await postCommand(app, JSON.stringify({ command: { type } }))
      expect(await res.json()).toEqual({ ok: true })
    }
    expect(types).toEqual(['run:stop', 'run:pause', 'run:resume'])
  })

  it('responds ok:true without a handler (well-formed no-op)', async () => {
    const app = createReceiverApp({ sinks: [] })
    const res = await postCommand(app, JSON.stringify({ command: { type: 'run:stop' } }))
    expect(await res.json()).toEqual({ ok: true })
  })

  it('responds ok:false for malformed JSON, unknown command types, and non-commands without calling onCommand', async () => {
    let calls = 0
    const app = createReceiverApp({ sinks: [], onCommand: () => void calls++ })

    for (const body of ['{not json', '{"command":{"type":"run:explode"}}', '{"command":42}', 'null', '[]']) {
      const res = await postCommand(app, body)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: false })
    }
    expect(calls).toBe(0)
  })

  it('responds ok:false when the handler throws (never a 5xx)', async () => {
    const app = createReceiverApp({
      sinks: [],
      onCommand: () => {
        throw new Error('actuation failed')
      },
    })

    const res = await postCommand(app, JSON.stringify({ command: { type: 'run:stop' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false })
  })
})
