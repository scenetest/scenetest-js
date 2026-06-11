import { describe, it, expect } from 'vitest'
import { createReceiverApp } from '../app.js'
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
