import { useMemo } from 'preact/hooks'
import { createLiveQueryCollection, eq, type Collection } from '@tanstack/db'
import { useLiveQuery, type ObservableRows } from './use-live-query.js'
import { latestRunId, type DashboardCollections, type RunSlice } from './select-helpers.js'
import type { SceneRow, AssertionRecord, ActionRecord } from './collections/projections.js'

/**
 * Build the latest-run slice the live views render — `where runId = latest`,
 * scenes/actions `orderBy startTime` — as **`@tanstack/db` live-query
 * collections** derived from the base tables, rather than re-scanning every
 * run's rows in JS each render (the old `latestRunSlice` fold). The DB
 * maintains the filter/sort incrementally; the views read the result through
 * `useLiveQuery` and hand it to the pure selectors (`selectWaterfall`,
 * `selectSnapshot`), which now take an already-sliced {@link RunSlice}.
 *
 * "Latest" is a reactive aggregate (the newest `run:start`), so it can't be a
 * static predicate. We read the small `runs` table to pick it, then key the
 * derived collections on it — they rebuild only when a *new run* starts (rare),
 * not on every scene/action/assertion event. The interactive filters (status
 * chips, text search) and the assertion→scene attribution stay reactive
 * selectors downstream: the chips must not move the header summary, and the
 * attribution is an actor + time-window fallback, not an equi-join.
 */

/** The live-query collections of one run's rows, the heart of {@link useRunSlice}. */
export interface RunSliceCollections {
  scenes: ObservableRows<SceneRow>
  assertions: ObservableRows<AssertionRecord>
  actions: ObservableRows<ActionRecord>
}

/**
 * Build the three derived live-query collections for `runId` — `where runId =
 * <runId>`, scenes/actions `orderBy startTime`. A pure builder (no hooks) so it
 * can be tested against `latestRunSlice` directly; `useRunSlice` memoizes it.
 * Before the first run, `runId` is undefined and we filter on a sentinel that
 * matches no real row (run ids are timestamps), so the slice is simply empty.
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
    ) as unknown as ObservableRows<SceneRow>,
    assertions: createLiveQueryCollection((q) =>
      q.from({ assertion: assertions }).where(({ assertion }) => eq(assertion.runId, key))
    ) as unknown as ObservableRows<AssertionRecord>,
    actions: createLiveQueryCollection((q) =>
      q
        .from({ action: actions })
        .where(({ action }) => eq(action.runId, key))
        .orderBy(({ action }) => action.startTime)
    ) as unknown as ObservableRows<ActionRecord>,
  }
}

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
