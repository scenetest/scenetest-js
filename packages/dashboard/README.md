# @scenetest/dashboard

The scenetest dashboard as a **Preact component**. The same UI renders the live
run in dev (inside the Vite plugin's `/__scenetest` page) and in scenetest-cloud
(a Worker-served page) — the host supplies a transport adapter, nothing else.

```tsx
import { render } from 'preact'
import { Dashboard, createDevTransport } from '@scenetest/dashboard'
import '@scenetest/dashboard/style.css'

render(<Dashboard transport={createDevTransport()} />, document.getElementById('root'))
```

It's a plain light-DOM Preact component — no shadow root. Styles ship as a
stylesheet the host imports (`@scenetest/dashboard/style.css`), scoped under the
`.scenetest-dashboard` root so they don't leak. Both hosts are Preact, so they
render `<Dashboard>` directly; there's no imperative mount wrapper.

## Transport adapter

The only thing that differs between dev and cloud. The dashboard subscribes to
the run stream and pushes user actions back as protocol commands:

```ts
interface Transport {
  subscribe(onEvent: (e: RunEvent) => void, onStatus?: (s: ConnectionStatus) => void): () => void
  sendCommand(command: Command): Promise<void>
}
```

Events and commands are the `@scenetest/protocol` vocabulary. `createDevTransport()`
speaks to the Vite middleware (SSE); a cloud adapter speaks to the worker
(WebSocket). History and live events both flow through `subscribe`: the
transport replays the run so far on connect (SSE replays its buffer; the cloud
WebSocket replays from a `sinceSeq`) and then streams live ones — the read model
folds both the same way, so there's no separate snapshot fetch.

## Theming

The only theming surface is a small set of CSS custom properties, passed as
`theme` and applied as inline `--st-*` variables on the `.scenetest-dashboard`
root:

```tsx
<Dashboard
  transport={transport}
  theme={{ bg: '#0b0d12', accent: '#7c93ff', font: 'IBM Plex Mono, monospace', fontSize: '12px' }}
/>
```

These map to `--st-bg`, `--st-accent`, `--st-font`, `--st-font-size`. Nothing
else is reachable; they are versioned with the component, like the wire protocol.

## Selectors

`<Dashboard>` reads the run stream through the collections read model (below),
but the view-projection logic is exported separately and is DOM-free — useful
for tests, SSR, or computing a rollup:

- `selectWaterfall(slice)` / `selectSnapshot(slice)` — project a latest-run `RunSlice` into the Waterfall / Runner view shapes
- `mapReportToSnapshot(report)` — adapt a past-run JSON report into the Runner shape
- `completedSceneCount(state)` — count of finished scenes
- `sceneSummary(scene)` — the plain-text "copy failures" summary

## Collections (`@scenetest/dashboard/collections`)

A read-only [TanStack DB](https://tanstack.com/db) read model over the run
stream — **the store `<Dashboard>` itself reads from** (dev and cloud), with
**live queries** (filter / aggregate / sort, recomputed incrementally). It's
also a subpath export so a cloud consumer can build the same collections with
**its own** `@tanstack/db` instance (e.g. fed by a Durable Object's WebSocket).

`createRunSource(transport)` wraps the transport as one shared, fan-out stream;
`runCollectionOptions({ source, projection })` returns a `CollectionConfig` you
pass to **your own** `createCollection` — so the collection is built by the same
`@tanstack/db` instance your `useLiveQuery` uses. Several collections ride
**one** connection ("subscribe to the stream, attach the tables"), and each is
a server-owned replica: the projection is the sole writer, so client
`.insert()`/`.update()` throws.

```ts
import { createCollection, count } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { createDevTransport } from '@scenetest/dashboard'
import { createRunSource, runCollectionOptions, scenesProjection, assertionsProjection } from '@scenetest/dashboard/collections'

const source = createRunSource(createDevTransport())            // one connection…
const scenes = createCollection(runCollectionOptions({ source, projection: scenesProjection() }))
const assertions = createCollection(runCollectionOptions({ source, projection: assertionsProjection() })) // …two tables

const { data } = useLiveQuery((q) =>
  q.from({ s: scenes }).groupBy(({ s }) => s.status)
    .select(({ s }) => ({ status: s.status, n: count(s.id) }))
)
// on teardown: source.close()
```

A projection speaks a tiny `RowOp` vocabulary (`insert`/`update`/`delete`/`reset`),
so `scenesProjection()` / `assertionsProjection()` / `runsProjection()` are
testable without TanStack DB at all. `@tanstack/db` is a **runtime dependency**
of the package (the dashboard calls `createCollection` to build its store), but
this `./collections` subpath itself only `import type`s `CollectionConfig` — so
a cloud consumer can build the collections with its own `@tanstack/db` instance
(one instance, so its `useLiveQuery` can join across them).

**Multi-run.** Rows are partitioned by `runId` (the `run:start` timestamp), so
one collection holds a whole PR's history — a new `run:start` opens a new
partition rather than truncating. `runsProjection()` gives one row per run
(status, counts, duration), which is the run picker / "most recent" rollup /
flaky surface as plain live queries; the live timeline is `where runId = <latest>`.
See `docs/public/design/unified-console.md`.

History/ordering/de-duplication remain the transport's contract (SSE replay in
dev, WebSocket `sinceSeq` replay in cloud); the source just consumes `onEvent`
and resets its replay buffer on `run:start`.
