import type { SceneRow, AssertionRecord, ActionRecord, RunRow } from './collections/projections.js'
import type { ConnectionStatus } from './types.js'

/**
 * The reactive rows of the read model, as the Dashboard root reads them from
 * the `@tanstack/db` collections and passes to every view. The views select
 * what they need from these (`selectWaterfall`, `selectSnapshot`).
 */
export interface DashboardRows {
  scenes: SceneRow[]
  assertions: AssertionRecord[]
  actions: ActionRecord[]
  runs: RunRow[]
  connection: ConnectionStatus
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
