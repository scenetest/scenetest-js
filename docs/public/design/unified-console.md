# Unified Console (dev + cloud)

**STATUS: Design + foundation in progress.** This doc records the target
architecture; the first code step (the multi-run collection model) lands
alongside it. The view extraction and the report loader are follow-ups.

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
  shell that mounts the extracted **`@scenetest/dashboard`** widget.

They're glued by `<a href="/__scenetest/dashboard">`. Two apps, two folds,
two mounts.

The cloud has the same split worse: it's organized **by run**
(`/r/:runId/*`), one page per run, while everything else in the product is
organized **by PR**. To browse runs you leave the page.

## The target

**One mountable app, many views, organized around a PR.** A PR is the stable
identity; runs are iterations inside it. One `mountConsole(el, …)` owns the
views as tabs — **Home** (index), **Runner** (the filterable scene log), and
**Waterfall** (the live timeline, which is today's `@scenetest/dashboard`
widget demoted from a *page* to a *view component*). Dev and cloud mount the
**same** app; only the data source differs.

```
                       mountConsole(el, { source })
                       ┌───────────────────────────────┐
                       │  Home   │  Runner  │ Waterfall │   ← views (tabs)
                       └───────────────────────────────┘
                                     │
                          one read model (collections)
```

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
`run:start` (matching the cloud's one-Durable-Object-per-run proposal). A
PR-history collection must not wipe when the next run begins. So:

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

- **`runId` is a timestamp** — derived from the `run:start` event's
  `timestamp`. No protocol change: the projection stamps each run's rows with
  the timestamp of the `run:start` that opened them. Replaying several
  historical reports works because each begins with its own `run:start`.
- **PR/branch identity rides in the report filename**, not the protocol:
  `pr-{num}-{timestamp}-{n}-scenes.json` in `scenetest/.reports/`. A
  `scenetest/.reports` folder is one repo, so the loader groups by PR number
  from the filename and stamps `pr` / `branch` onto the `runs` row when it
  replays. (Live dev runs without a PR are just ungrouped, "local".)

## Dev ↔ cloud mapping

| | dev | cloud |
|---|---|---|
| run history | replay `scenetest/.reports/*.json` for the branch/PR | replay from D1 (metadata) + R2 (event log) |
| live run | SSE (`/__scenetest/events`) | WebSocket (Durable Object) |
| identity | filename `pr-{num}-{timestamp}-…` | D1 runId + PR row |
| URL | one page per dev session | `/pr/:owner/:repo/:number` (run = picker, not URL) |
| mount | `mountConsole` | `mountConsole` (same app) |

## Phasing

1. **(this PR)** Multi-run collection model: rows carry `runId`, projections
   partition instead of truncate, add the `runs` projection. + this doc.
2. **Report loader**: parse `pr-{num}-{timestamp}-…` filenames, replay each
   report's events into the collection, stamp PR/branch on the `runs` row.
   Cumulative rollups (most-recent, flaky) become live queries.
3. **Extract `mountConsole`**: turn `analyze-app.ts`'s inline string into a
   real Preact app in `@scenetest/dashboard`, with Home/Runner/Waterfall
   views over the shared read model. Collapse the duplicated `applyEvent`.
   Requires the Vite plugin to **bundle** the app (esbuild) rather than serve
   raw single-file ESM — same prerequisite as the widget migration (#215).
4. **Cloud**: implement the data source against D1/R2/DO behind `Transport`;
   reorganize URLs run → PR; embed `mountConsole`.

## What stays out of `Transport`

Live streaming and commands only. History loading is a separate concern (a
loader that feeds past events in), and listing/rollups/flaky are queries over
the collection — never methods on the transport.
