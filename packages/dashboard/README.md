# @scenetest/dashboard

The scenetest dashboard as a mountable widget. The same Preact UI renders the
live run in dev (inside the Vite plugin's `/__scenetest` page) and in
scenetest-cloud (a Worker-served page) — the host supplies a DOM element and a
transport adapter, nothing else.

```ts
import { mountDashboard, createDevTransport } from '@scenetest/dashboard'

const handle = mountDashboard(document.getElementById('root'), {
  transport: createDevTransport(),
})
// later: handle.unmount()
```

The widget renders into a **shadow root** with its own styles and fonts, so it
drops into any host without leaking styles in either direction and without the
host using Preact.

## Transport adapter

The only thing that differs between dev and cloud. The widget calls the
adapter to fetch a snapshot and subscribe to live events, and pushes user
actions back as protocol commands:

```ts
interface Transport {
  fetchState(): Promise<RunEvent[]>
  subscribe(onEvent: (e: RunEvent) => void, onStatus?: (s: ConnectionStatus) => void): () => void
  sendCommand(command: Command): Promise<void>
}
```

Events and commands are the `@scenetest/protocol` vocabulary. `createDevTransport()`
speaks to the Vite middleware (fetch + SSE); a cloud adapter speaks to the
worker (fetch + WebSocket). History may arrive through either `fetchState`
(snapshot) or the initial `subscribe` burst — the store folds both the same
way, so a transport picks whichever its backend makes natural (SSE replays the
buffer through `subscribe`, so the dev adapter's `fetchState` returns empty).

## Theming

The widget's only theming surface is a small set of CSS custom properties,
passed as `theme` and applied to the shadow host:

```ts
mountDashboard(el, {
  transport,
  theme: { bg: '#0b0d12', accent: '#7c93ff', font: 'IBM Plex Mono, monospace', fontSize: '12px' },
})
```

These map to `--st-bg`, `--st-accent`, `--st-font`, `--st-font-size`. Nothing
else is reachable; they are versioned with the widget, like the wire protocol.

## Store

`mountDashboard` is the entry point, but the event-folding logic is exported
separately and is DOM-free — useful for tests, SSR, or computing a rollup:

- `foldEvents(events)` / `applyEvent(state, event)` — reduce protocol events into `DashboardState`
- `initialState()`, `completedSceneCount(state)`, `withConnection(state, status)`
- `sceneSummary(scene)` — the plain-text "copy failures" summary

## Collections (`@scenetest/dashboard/collections`)

A read-only [TanStack DB](https://tanstack.com/db) read model over the same
run stream. `createRunSource(transport)` wraps the transport as one shared,
fan-out stream; each collection is a projection of it into rows. Several
collections ride **one** connection — "subscribe to the stream, attach the
tables" — and each is a server-owned replica: the projection is the sole
writer, so client `.insert()`/`.update()` throws.

```ts
import { useLiveQuery } from '@tanstack/react-db'
import { createDevTransport } from '@scenetest/dashboard'
import { createRunModel } from '@scenetest/dashboard/collections'

const { scenes, assertions, close } = createRunModel(createDevTransport())

// live queries — filter / aggregate / sort, recomputed incrementally
const { data } = useLiveQuery((q) =>
  q.from({ s: scenes }).groupBy(({ s }) => s.status)
    .select(({ s }) => ({ status: s.status, n: count(s.id) }))
)
// on teardown: close()
```

Lower-level building blocks are exported too: `createRunSource`,
`runCollectionOptions` / `createRunCollection` (point a projection at a source),
and the `scenesProjection()` / `assertionsProjection()` reducers. A projection
speaks a tiny `RowOp` vocabulary (`insert`/`update`/`delete`/`reset`), so it is
testable without TanStack DB. `@tanstack/db` is an **optional peer dependency** —
only needed if you import this subpath; the widget entry never pulls it in.

History/ordering/de-duplication remain the transport's contract (SSE replay in
dev, WebSocket `sinceSeq` replay in cloud); the source just consumes `onEvent`
and resets its replay buffer on `run:start`.
