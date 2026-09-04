# Unified Console (dev + cloud)

**STATUS: Dev console landed; cloud + report loader pending.** Phases 1
(multi-run collection model) and 3 (`<Dashboard>`, replacing the inline
`analyze-app.ts`) are done. The console is now **two views, Home + Runner**: the
separate **Waterfall** view has been removed and its two distinct capabilities —
the per-actor lane timeline and the run controls (replay-all + team, pause /
resume, stop, progress + elapsed clock) — folded into the Runner (the lanes into
the scene detail, the controls into the Runner header). Routing rides on one
`preact-iso` `LocationProvider` owned by the host (see
[Routing](#routing-one-preact-iso-router-owned-by-the-host)): dev wraps it in
`BrowserDashboard`, cloud renders the bare `<Dashboard>` under its own route. The
PR-history report loader (phase 2) and the cloud transport / shell (phase 4) are
the remaining work.

---

## The problem

The dev experience under `/__scenetest` is actually **two separate
front-ends** that only link to each other:

- **`packages/vite-plugin/src/analyze-app.ts`** (~900 lines) — the index +
  runner page, served as a single **inline HTML+JS string**. It carries its
  own `applyEvent` (a duplicate of the dashboard's fold, in a different
  `RunReport` shape) and talks straight to middleware routes
  (`/__scenetest/runs`, `/runs/:id`, `/events`, `/source`).
- **`packages/vite-plugin/src/dashboard.ts`** — the "Waterfall" page, a thin
  shell that renders the extracted **`@scenetest/dashboard`** component.

They're glued by `<a href="/__scenetest/dashboard">`. Two apps, two folds,
two mounts.

The product is organized **by PR** — runs are iterations within a PR — so the
console should be too. A run-centric console (one page per run) fragments that:
to browse a PR's run history you leave the page.

## The target

**One app, many views, organized around a PR.** A PR is the stable
identity; runs are iterations inside it. One `<Dashboard>` component owns the
views as tabs — **Home** (index) and **Runner** (the filterable scene log, which
selects a scene *or* a file, shows the per-actor lane timeline in its scene
detail, and carries the run controls in its header). Dev and cloud render the
**same** component; only the data source differs.

```
                       <Dashboard transport={…} />
                       ┌──────────────────────┐
                       │  Home   │   Runner   │   ← views (tabs)
                       └──────────────────────┘
                                     │
                          one read model (collections)
```

> **History.** An earlier iteration shipped a third view, **Waterfall** — the
> live per-actor timeline as its own page. It duplicated most of the Runner
> (scenes, status, assertions, replay), so it was removed and its two unique
> parts absorbed into the Runner: the actor lanes into the scene detail, the run
> controls (replay-all + team, pause / resume, stop, progress + elapsed) into the
> Runner header.

## The key idea: the collection *is* the read model, across runs

The data interface stays lean. `Transport` keeps doing what it does — live
`subscribe` + `sendCommand` — and **does not** grow `listRuns()` /
`fetchRun()`. Instead:

- A PR's **entire run history** is fed into the collection as events (dev
  replays local report files; cloud replays from D1/R2), then live events
  arrive through the same `Transport.subscribe`.
- **Everything else is a query.** The run picker, the "most recent" rollup,
  and flaky detection are all live queries over a `runs` table. There is no
  `listRuns()` method — it's `useLiveQuery(runs)`.

```
past runs (replayed as events) ──┐
                                 ├─► one multi-run collection (partitioned by runId)
live run (Transport.subscribe) ──┘            │
                                              ├─ runs        → picker, rollups, flaky
                                              ├─ scenes      → timeline for a runId
                                              └─ assertions
```

### What this changes about the single-run collection (#214)

The collection shipped in #214 is **single-run**: it truncates on
`run:start` (matching the cloud's *original* one-Durable-Object-**per-run**
sketch). A PR-history collection must not wipe when the next run begins. So:

- **`run:start` no longer truncates.** It opens a **new run partition**.
- **Rows carry a `runId`.** Scenes are keyed `(runId, teamIndex, name)`,
  assertions `(runId, n)`. The live timeline is just `where runId = latest`.
- **A new `runs` projection** folds `run:start` / `run:end` into one row per
  run (status, counts, duration, and later PR/branch identity + flaky). That
  table is the picker and the rollups.
- **The source stops resetting its replay buffer on `run:start`** — prior
  runs are history we want, not stale state.

The cloud single-run viewer is unchanged in behaviour: it's simply the
`where runId = latest` slice of this same model, and dropping the truncate
makes reconnect-replay idempotent (re-seeing `run:start` re-opens the same
partition instead of wiping).

## Identity: runId and PR/branch

The unit is the **PR**; `runId` is just a within-PR key we use where one is
handy — **not** an organizing concept, and crucially **not an API or route
surface**. There are no `runId`-specific endpoints or app routes: the Runner's
run picker is a `?run=` query param over a `runs` *table* (a live query, see
above), past runs are reports keyed by id, and the cloud URL is per-PR with the
run chosen in-page. Where `runId` actually earns its keep:

- **Storage layout.** It's how we partition the on-disk archive and the
  `.jsonl` event logs, and (later) how a **chunked restore** streams a PR's
  history back in file by file rather than all at once.
- **Aggregate cache.** On `run:start` / `run:end` we report rollup stats to the
  Cloudflare worker's **D1**. That's a UI concern (the picker/most-recent/flaky
  summaries) and a caching one — precomputed aggregates so a viewer doesn't
  re-fold a PR's whole history on every load.

It still rides **on every event** — `runId` is a required field of every
`RunEvent` (`@scenetest/protocol`), stamped once by the producer at `run:start`
time (`dashboardSend` sets it; call sites don't thread it). It's required like
`name`/`file`, not optional — deriving it from event order would break on
reconnect/mid-stream attach, where a consumer's replay window may not include
`run:start`. With it on the event, projections are stateless and slice
correctly (`where runId = latest`) no matter where a consumer joins. (This was
a breaking wire change, taken deliberately while the protocol is pre-1.0 and
unused — `PROTOCOL_VERSION` is left at 1.)

**PR/branch identity**, by contrast, rides in the report filename, not the
protocol: `pr-{num}-{timestamp}-{n}-scenes.json` in `scenetest/.reports/`. A
`scenetest/.reports` folder is one repo, so the loader groups by PR number from
the filename and stamps `pr` / `branch` onto the `runs` row when it replays.
(Live dev runs without a PR are just ungrouped, "local".)

## Dev ↔ cloud mapping

| | dev | cloud |
|---|---|---|
| run history | replay `scenetest/.reports/*.json` for the branch/PR | replay from D1 (metadata) + R2 (event log) |
| live run | SSE (`/__scenetest/events`) | WebSocket (Durable Object) |
| identity | filename `pr-{num}-{timestamp}-…` | D1 runId + PR row |
| URL | `/__scenetest{/runner}` (run = `?run=` picker) | `/repo/:owner/:name/pr/:number{/runner}` (run = picker) |
| routing | `BrowserDashboard` supplies the `LocationProvider` | host's own `LocationProvider` (preact-iso) |
| mount | `<BrowserDashboard transport>` | `<Dashboard transport basePath>` (same component) |

### Cloud storage granularity: per-PR, not per-run

The cloud organizes coordination *and* storage around the **PR** — which is
exactly what this read model wants. The dashboard reads **one multi-run
collection per PR** (runs are partitions inside it), so the server-side store is
per-PR too, not fragmented per-run and reassembled on read:

- **One Durable Object per PR** coordinates the box, fans out to viewers, and
  holds the command queue; runs are partitions within it, not separate objects,
  so there is no fan-in across run objects to reconstruct a PR's history. This
  supersedes the per-run-DO sketch noted above.
- **R2 is the cold archive of a retired (merged/closed) PR's history**, with the
  PR's Durable Object as the hot store — not a per-run live event log.

This is the server-side mirror of the client decision: the PR is the aggregate,
the run is a partition. The cloud side is specified authoritatively in
scenetest-cloud's `architecture.md`.

## Routing: one preact-iso router, owned by the host

There is **one** router — `preact-iso`, the same router scenetest-cloud already
uses — and the host app owns its single `LocationProvider`. The dashboard does
not bring a second one. It mounts on a **single route with an optional trailing
param, `{base}/:view?`**, which matches the base *and* each view in one pattern
(`:view?` is the accepted way a scoped router handles its own exact base — no
separate "index" route, no redirect). preact-iso hands the matched segment back
as a param; the dashboard reads `useRoute().params.view` and renders it. Because
the view is a route param, the *same* `<Dashboard>` works whether it's the whole
app or mounted on a per-PR route of a bigger app, and it stays mounted across
view changes (the store survives) since every view matches the one route.

- **Dev / standalone** — render **`BrowserDashboard`**, which supplies the one
  `LocationProvider` (scoped to `basePath`) and a `Router` mounting `<Dashboard
  path={`${base}/:view?`} />`. The provider intercepts the tab `<a>` clicks for
  client-side nav and serves reloads / deep-links; the middleware returns the app
  at every view route. The dev shell is `render(<BrowserDashboard transport={…} />)`.
- **Embedded (cloud)** — cloud already owns a `LocationProvider`, so it adds
  `:view?` to its own PR route, `/repo/:owner/:name/pr/:number/:view?`, and renders
  `<Dashboard basePath={prMount} />` under it. The dashboard reads the same
  `useRoute().params.view` and nests with no extra wiring — the whole point of
  using the router cloud already has.

`LocationProvider` does the hard parts (history, scoped `<a>`-click interception);
the matcher extracts the view; the dashboard's only view↔URL logic is reading the
param, so there's no `viewForPath`/`viewHref` scheme to drift. Two props shape the
URLs without coupling to a router:

- **`basePath`** (default `/__scenetest`) — only builds the absolute, deep-linkable
  tab `<a>` hrefs. View *selection* is the route param, so cloud's per-PR mount
  needs nothing more. Cloud passes its PR mount.
- **`apiBase`** (defaults to `basePath`) — the base for the Runner's
  server-endpoint fetches (`/runs`, `/source`, `/__open-in-editor`). Decoupled
  because cloud's API lives elsewhere than its router; dev's two coincide.

This is the fix for the cloud team's report that the old hardcoded
`/__scenetest` routing + in-widget `pushState` rewrote the host's URL to a path
its router and worker shell didn't serve (tab clicks lied; reload / deep-link
404'd) — by deferring to the host's own router instead of running a second one.

## Phasing

1. **✅ Done.** Multi-run collection model: rows carry `runId`, projections
   partition instead of truncate, add the `runs` projection. + this doc.
2. **Report loader** (pending): parse `pr-{num}-{timestamp}-…` filenames, replay
   each report's events into the collection, stamp PR/branch on the `runs` row.
   Cumulative rollups (most-recent, flaky) become live queries. (The Runner's
   past-run picker currently fetches a single report via `/__scenetest/runs/:id`
   and maps it directly — `mapReportToSnapshot` — rather than replaying all of a
   PR's history into the collection.)
3. **✅ Done.** `<Dashboard>` in `@scenetest/dashboard` — a real Preact app,
   served by the Vite plugin's bundled shell (the `analyze-app.ts` inline string
   + its raw-ESM `/__scenetest/vendor/*` routes are deleted). It shipped with
   Home / Runner / Waterfall views; the Waterfall was later removed and its
   actor-lane timeline + run controls folded into the Runner, leaving **Home +
   Runner**. The Runner folds the shared collection **projections** +
   `attributeToScene` directly into Preact state (the bundling prerequisite, #215,
   landed first).
4. **Cloud** (pending): implement the data source against D1/R2/DO behind
   `Transport`; render `<Dashboard>`. The routing seam landed early — the
   dashboard reads cloud's own `preact-iso` `LocationProvider`, so cloud mounts
   `<Dashboard basePath={prMount} />` under its PR route per
   [Routing](#routing-one-preact-iso-router-owned-by-the-host); what remains
   here is the transport + the report loader (phase 2).

## What stays out of `Transport`

Live streaming and commands only. History loading is a separate concern (a
loader that feeds past events in), and listing/rollups/flaky are queries over
the collection — never methods on the transport.
