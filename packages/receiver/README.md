# @scenetest/receiver

Framework-agnostic core for scenetest's event/command relay: a [Hono](https://hono.dev)
app that takes protocol **events** in and fans them out to sinks, and takes
protocol **commands** (directions) in and hands them to a host-supplied handler.
The Vite dev middleware and the scenetest-cloud runner box mount the same app, so
dev and cloud behave the same by construction. Only the transport (and what the
host does with a command) differs.

## Events in → sinks

`POST /events` — one protocol event per request, envelope-validated with
`isEventShaped()` only (relay semantics: event types newer than this package
pass through instead of being dropped). On `run:start`, each sink's `clear?.()`
runs before the event is written. Always responds HTTP 200
(`{"ok":true}`/`{"ok":false}`) — producers are fire-and-forget.

```ts
const app = createReceiverApp({ sinks: [eventHub, new JsonlSink(path)] })
```

`Sink` is `{ write(event), clear?() }`; `JsonlSink` appends one event per line.

## Commands in → onCommand

`POST /commands` — body `{ command, runId? }` (a bare command object also works),
decoded strictly with `decodeCommand`. A valid command is handed to the optional
`onCommand(command, { runId })`. `runId` is metadata, **never the address** —
commands act on the host's *active* run, so a run-agnostic `run:stop` Just Works.
Always responds 200, including when the handler throws.

Commands are **transient, not log entries.** The receiver does not order, log, or
sink them — it decodes and dispatches. Only the *effect* of acting on a command
re-enters the event stream (e.g. `run:pause` → a `run:paused` event). Any command
file or queue is a delivery mechanism, never a record.

### The command path: same `onCommand`, different door

A direction reaches the **same `onCommand`** through a transport-specific door;
`onCommand` itself is transport-agnostic:

```
dev:   browser dashboard ──HTTP POST /commands──▶ onCommand ──▶ (host hop) ──▶ CLI
cloud: PR coordinator ───────WS down────────────▶ onCommand ──▶ (host hop) ──▶ CLI
```

In **cloud**, the box's outbound WebSocket is held by the receiver itself, so a
direction arriving on the socket is a direct in-process call to `onCommand` — no
internal HTTP. The `POST /commands` route is the **dev** door: the dashboard is a
browser and must cross to the server, and same-origin HTTP is that crossing.

What `onCommand` does to reach the *live* CLI is the **host's** concern, not the
receiver's. The receiver decodes and dispatches; actuation is process-local,
because the receiver (in the app's long-lived dev server) and the run (the
separate `scenes` CLI driving Playwright) are different processes. The one
unavoidable hop across that boundary — e.g. the Vite middleware appending the
run-control verbs to a file the CLI tails — is delivery, owned by the host, and
identical in dev and cloud.

## Mounting

`toNodeHandler(app)` adapts the Hono app to a Node `(req, res)` listener for
connect-style servers (the Vite dev server). `ReceiverAppType` types a
`hono/client`.
