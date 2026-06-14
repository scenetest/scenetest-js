import type { SceneRow, AssertionRecord, ActionRecord, RunRow } from './collections/projections.js'
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

export function latestRunSlice(
  scenes: SceneRow[],
  assertions: AssertionRecord[],
  actions: ActionRecord[],
  runs: RunRow[]
): RunSlice {
  const byStart = [...scenes].sort((a, b) => a.startTime - b.startTime)
  const run = runs.reduce<RunRow | undefined>((m, r) => (!m || r.startTime > m.startTime ? r : m), undefined)
  const runId = run?.id ?? (byStart.length ? byStart[byStart.length - 1].runId : undefined)
  return {
    runId,
    run,
    scenes: runId ? byStart.filter((s) => s.runId === runId) : byStart,
    assertions: runId ? assertions.filter((a) => a.runId === runId) : assertions,
    actions: runId ? actions.filter((a) => a.runId === runId) : actions,
  }
}
