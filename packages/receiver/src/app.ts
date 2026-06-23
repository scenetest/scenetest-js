import { Hono } from 'hono'
import { decodeCommand, isEventShaped } from '@scenetest/protocol'
import type { Sink, SinkEvent } from './sink.js'
import type { CommandHandler } from './command.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Create the framework-agnostic receiver core: a Hono app accepting protocol
 * events over HTTP (fanned out to `sinks`) and protocol commands over the
 * reverse path (handed to an optional `onCommand`).
 *
 * Routes:
 * - `POST /events` — one event per request, validated with `isEventShaped()`
 *   only (relay semantics: pass through types newer than this package).
 *   `run:start` triggers each sink's `clear?.()` before the event is written.
 * - `POST /commands` — body `{ command, runId? }` or a bare command, decoded
 *   strictly via `decodeCommand`. `runId` is optional metadata (active-run, not
 *   addressed). Dispatched to `onCommand` when valid and wired.
 *
 * Always responds HTTP 200 (`ok:true`/`ok:false`) — both producers are
 * fire-and-forget, and old peers must never break on an error status. Routes
 * chain so the app type carries the schema for `hono/client`.
 */
export function createReceiverApp({
  sinks,
  onCommand,
}: {
  sinks: Sink[]
  onCommand?: CommandHandler
}) {
  const app = new Hono()
    .post('/events', async (c) => {
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
    .post('/commands', async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ ok: false })
      }

      // Accept `{ command, runId? }` (the cloud wire shape) or a bare command.
      const wrapped = isObject(body) && 'command' in body
      const command = decodeCommand(wrapped ? (body as { command: unknown }).command : body)
      if (!command) {
        return c.json({ ok: false })
      }

      const runId =
        wrapped && typeof (body as { runId?: unknown }).runId === 'string'
          ? (body as { runId: string }).runId
          : undefined

      if (onCommand) {
        try {
          await onCommand(command, { runId })
        } catch {
          return c.json({ ok: false })
        }
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
