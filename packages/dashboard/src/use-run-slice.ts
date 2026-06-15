import { useMemo } from 'preact/hooks'
import { createLiveQueryCollection, eq, type Collection } from '@tanstack/db'
import { useLiveQuery, type ObservableRows } from './use-live-query.js'
import { latestRunId, type DashboardCollections, type RunSlice } from './select-helpers.js'
import type { SceneRow, AssertionRecord, ActionRecord } from './collections/projections.js'

/** The live-query collections of one run's rows, the heart of {@link useRunSlice}. */
export interface RunSliceCollections {
  scenes: ObservableRows<SceneRow>
  assertions: ObservableRows<AssertionRecord>
  actions: ObservableRows<ActionRecord>
}

/**
 * Build the three derived live-query collections for `runId` (`where runId = …`,
 * scenes/actions `orderBy startTime`). A pure builder (no hooks) so it can be
 * tested against `latestRunSlice` directly. Before the first run `runId` is
 * undefined, so we filter on a sentinel that matches no real row (ids are
 * timestamps) and the slice comes back empty.
 */
export function runSliceCollections(
  collections: DashboardCollections,
  runId: string | undefined
): RunSliceCollections {
  const key = runId ?? ' no-run'
  const scenes = collections.scenes as unknown as Collection<SceneRow>
  const assertions = collections.assertions as unknown as Collection<AssertionRecord>
  const actions = collections.actions as unknown as Collection<ActionRecord>
  return {
    scenes: createLiveQueryCollection((q) =>
      q
        .from({ scene: scenes })
        .where(({ scene }) => eq(scene.runId, key))
        .orderBy(({ scene }) => scene.startTime)
    ),
    assertions: createLiveQueryCollection((q) =>
      q.from({ assertion: assertions }).where(({ assertion }) => eq(assertion.runId, key))
    ),
    actions: createLiveQueryCollection((q) =>
      q
        .from({ action: actions })
        .where(({ action }) => eq(action.runId, key))
        .orderBy(({ action }) => action.startTime)
    ),
  }
}

/**
 * The latest-run slice the live views render, maintained incrementally by
 * `@tanstack/db` rather than re-scanned in JS each render. Picks the latest run
 * from the small `runs` table and rebuilds the derived collections only when a
 * new run starts; the views hand the result to the pure selectors.
 */
export function useRunSlice(collections: DashboardCollections): RunSlice {
  const runs = useLiveQuery(collections.runs)
  const runId = latestRunId(runs)
  const run = runId ? runs.find((r) => r.id === runId) : undefined

  // Rebuild only when a new run starts (runId changes), not on every event.
  const queries = useMemo(
    () => runSliceCollections(collections, runId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collections are stable; rebuild only when the run changes
    [collections.scenes, collections.assertions, collections.actions, runId]
  )

  const scenes = useLiveQuery(queries.scenes)
  const assertions = useLiveQuery(queries.assertions)
  const actions = useLiveQuery(queries.actions)

  return { runId, run, scenes, assertions, actions }
}
