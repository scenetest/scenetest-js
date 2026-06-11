import { Hono } from 'hono'
import { isEventShaped } from '@scenetest/protocol'
import type { Sink, SinkEvent } from './sink.js'

/**
 * Create the framework-agnostic receiver core: a Hono app that accepts
 * protocol events over HTTP and fans them out to the given sinks.
 *
 * Routes:
 * - `POST /events` — one JSON event per request. Validated with
 *   `isEventShaped()` only (envelope check, NOT strict `decodeEvent`):
 *   the receiver is a relay and must pass through event types newer
 *   than itself. On `run:start`, each sink's `clear?.()` runs before
 *   the event is written.
 *
 * Responses are always HTTP 200 — `{"ok":true}` for accepted events,
 * `{"ok":false}` for malformed or non-event bodies. The CLI's reporter
 * is fire-and-forget, and old CLIs must never be broken by an error
 * status.
 *
 * Routes are defined with method chaining so the inferred app type
 * carries the route schema for `hono/client` typed transports.
 */
export function createReceiverApp({ sinks }: { sinks: Sink[] }) {
  const app = new Hono().post('/events', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false })
    }

    if (!isEventShaped(body)) {
      return c.json({ ok: false })
    }

    const event = body as SinkEvent

    // New run: let live-state sinks reset before the run:start lands.
    if (event.type === 'run:start') {
      for (const sink of sinks) {
        sink.clear?.()
      }
    }

    for (const sink of sinks) {
      sink.write(event)
    }

    return c.json({ ok: true })
  })

  return app
}

/**
 * The receiver app's route schema, for `hono/client`:
 *
 * ```ts
 * import { hc } from 'hono/client'
 * import type { ReceiverAppType } from '@scenetest/receiver'
 * const client = hc<ReceiverAppType>('http://localhost:5173/__scenetest')
 * ```
 */
export type ReceiverAppType = ReturnType<typeof createReceiverApp>
