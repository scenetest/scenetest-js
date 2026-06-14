import type { SceneRow, AssertionRecord, ActionRecord, RunRow } from './collections/projections.js'
import { attributeToScene } from './collections/projections.js'
import type { ObservableRows } from './use-live-query.js'

/**
 * The read model's collections, created once at the Dashboard root and passed
 * to every view. Each view reads the tables it needs reactively with
 * `useLiveQuery`, then selects (`selectWaterfall`, `selectSnapshot`). Typed
 * structurally ({@link ObservableRows}) so the concrete `@tanstack/db`
 * `Collection`s satisfy it without leaking their generics.
 */
export interface DashboardCollections {
  scenes: ObservableRows<SceneRow>
  assertions: ObservableRows<AssertionRecord>
  actions: ObservableRows<ActionRecord>
  runs: ObservableRows<RunRow>
}

/**
 * The one read model is multi-run (the collections accumulate every run of the
 * session). The live views — Waterfall and Runner — show the **latest** run,
 * i.e. the `where runId = latest` slice. This helper computes that slice once,
 * so both selectors share the same "current run" definition.
 */
export interface RunSlice {
  runId: string | undefined
  run: RunRow | undefined
  scenes: SceneRow[]
  assertions: AssertionRecord[]
  actions: ActionRecord[]
}

/**
 * The latest run's id — the newest `run:start` (max `startTime`). "Latest" is a
 * reactive aggregate, not a static predicate, so the live `useRunSlice` reads
 * it to key its derived collections, and `latestRunSlice` reuses it for the
 * pure (test) path. Falls back to the most-recent scene's `runId` only when no
 * run row exists yet — a window that doesn't occur in practice, since
 * `run:start` always precedes the first scene and seeds a run row.
 */
export function latestRunId(runs: RunRow[], scenes: SceneRow[] = []): string | undefined {
  const run = runs.reduce<RunRow | undefined>((m, r) => (!m || r.startTime > m.startTime ? r : m), undefined)
  if (run) return run.id
  if (scenes.length === 0) return undefined
  return scenes.reduce((m, s) => (s.startTime > m.startTime ? s : m)).runId
}

/**
 * Bucket assertion/action rows by the scene they attribute to, in **one pass**
 * over the rows. Both selectors then read each scene's rows by id instead of
 * re-filtering the whole list per scene through `attributeToScene` (which itself
 * scans the scenes) — turning the O(scenes² × rows) per-scene filter into one
 * O(rows × scenes) pass. Rows that attribute to no scene are dropped.
 */
export function groupByScene<T extends { sceneId: string | null; runId: string; actor: string | null; timestamp: number }>(
  rows: T[],
  scenes: SceneRow[]
): Map<string, T[]> {
  const byScene = new Map<string, T[]>()
  for (const row of rows) {
    const id = attributeToScene(row, scenes)
    if (id === null) continue
    const bucket = byScene.get(id)
    if (bucket) bucket.push(row)
    else byScene.set(id, [row])
  }
  return byScene
}

export function latestRunSlice(
  scenes: SceneRow[],
  assertions: AssertionRecord[],
  actions: ActionRecord[],
  runs: RunRow[]
): RunSlice {
  const byStart = [...scenes].sort((a, b) => a.startTime - b.startTime)
  const runId = latestRunId(runs, scenes)
  const run = runs.find((r) => r.id === runId)
  return {
    runId,
    run,
    scenes: runId ? byStart.filter((s) => s.runId === runId) : byStart,
    assertions: runId ? assertions.filter((a) => a.runId === runId) : assertions,
    actions: runId ? actions.filter((a) => a.runId === runId) : actions,
  }
}
