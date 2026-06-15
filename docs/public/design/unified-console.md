# Unified Console (dev + cloud)

**STATUS: Dev console landed; cloud + report loader pending.** Phases 1
(multi-run collection model) and 3 (`mountConsole` with Home/Runner/Waterfall,
replacing the inline `analyze-app.ts`) are done. The PR-history report loader
(phase 2) and the cloud transport / URL reorg (phase 4) are the remaining work.

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

- **`runId` is a timestamp**, and it rides **on every event** — `runId` is a
  required field of every `RunEvent` (`@scenetest/protocol`), stamped once by
  the producer at `run:start` time (`dashboardSend` sets it; call sites don't
  thread it). It's required like `name`/`file`, not optional — deriving it
  from event order would break on reconnect/mid-stream attach, where a
  consumer's replay window may not include `run:start`. With it on the event,
  projections are stateless and partition correctly no matter where a consumer
  joins. (This is a breaking wire change, taken deliberately while the protocol
  is pre-1.0 and unused — `PROTOCOL_VERSION` is left at 1.)
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

### Cloud storage granularity: per-PR, not per-run

The cloud has converged on the **PR** as the unit of coordination *and*
storage — which is exactly what this read model wants. The dashboard reads
**one multi-run collection per PR** (runs are partitions inside it), so the
server-side store should be per-PR too, not fragmented per-run and reassembled
on read:

- **One Durable Object per PR** — *done*. The PR object coordinates the box,
  fans out to viewers, and holds the command queue; runs are partitions within
  it, not separate objects. This supersedes the per-run-DO sketch noted above —
  there is no fan-in across run objects to reconstruct a PR's history.
- **R2 archive per PR** — *in progress*. Today R2 holds a per-run `.jsonl`
  written at end-of-run (`runs/<repo>/<runId>.jsonl`); the move underway is to
  treat R2 as the **cold archive of a retired (merged/closed) PR's** accumulated
  history, with the PR's Durable Object holding the hot store, rather than R2
  being a per-run live event log.

This is the server-side mirror of the client decision: PR is the aggregate, the
run is a partition. The authoritative spec for the cloud side is
scenetest-cloud's `architecture.md`; this note only records the alignment so the
two repos don't drift on what "the unit" is. (Heads-up for whoever syncs that
doc: it still describes the dashboard as a shadow-root `mountDashboard()` widget
with a `fetchState`-based transport — all removed in `@scenetest/dashboard`
0.12.0, which is *our* package's contract to state, not theirs.)

## Phasing

1. **✅ Done.** Multi-run collection model: rows carry `runId`, projections
   partition instead of truncate, add the `runs` projection. + this doc.
2. **Report loader** (pending): parse `pr-{num}-{timestamp}-…` filenames, replay
   each report's events into the collection, stamp PR/branch on the `runs` row.
   Cumulative rollups (most-recent, flaky) become live queries. (The Runner's
   past-run picker currently fetches a single report via `/__scenetest/runs/:id`
   and maps it directly — `mapReportToSnapshot` — rather than replaying all of a
   PR's history into the collection.)
3. **✅ Done.** `mountConsole` in `@scenetest/dashboard` — a real Preact app with
   Home/Runner/Waterfall views, served by the Vite plugin's bundled shell (the
   `analyze-app.ts` inline string + its raw-ESM `/__scenetest/vendor/*` routes
   are deleted). The Waterfall is the existing widget demoted to a nested-shadow
   view. The Runner folds the shared collection **projections** + `attributeToScene`
   directly into Preact state (the bundling prerequisite, #215, landed first).
4. **Cloud** (pending): implement the data source against D1/R2/DO behind
   `Transport`; reorganize URLs run → PR; embed `mountConsole`.

## What stays out of `Transport`

Live streaming and commands only. History loading is a separate concern (a
loader that feeds past events in), and listing/rollups/flaky are queries over
the collection — never methods on the transport.
