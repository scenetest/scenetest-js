import type { ActionRecord } from './collections/projections.js'
import type { ActionItem, DashboardState, Lane, Scene } from './types.js'
import { groupByScene, type RunSlice } from './select-helpers.js'

function laneStatus(a: ActionRecord): ActionItem['status'] {
  if (a.status === 'running') return 'running'
  if (a.status === 'error') return 'error'
  return a.duration != null && a.duration > 500 ? 'slow' : 'success'
}

/**
 * Project the read model into the Waterfall view's shape. This is the
 * Waterfall reading from the one store — it replaced the bespoke `applyEvent`
 * fold. It takes the latest-run {@link RunSlice} (built incrementally by
 * `useRunSlice`'s live-query collections, or by `latestRunSlice` in tests):
 * actions become per-actor lanes, assertions are attributed to their scene
 * (`attributeToScene`), and the run rollup drives the pass/fail/scene counts.
 *
 * Returns the projected view data only — `connection` is the host's to supply
 * (`WaterfallHost` spreads it in), since a pure projection can't know it.
 */
export function selectWaterfall(slice: RunSlice): Omit<DashboardState, 'connection'> {
  const actionsByScene = groupByScene(slice.actions, slice.scenes)
  const assertionsByScene = groupByScene(slice.assertions, slice.scenes)

  const viewScenes: Scene[] = slice.scenes.map((s) => {
    const lanes: Lane[] = s.actors.map((actor) => ({ actor, items: [] }))
    const laneFor = (actor: string): Lane => {
      let lane = lanes.find((l) => l.actor === actor)
      if (!lane) {
        lane = { actor, items: [] }
        lanes.push(lane)
      }
      return lane
    }
    for (const a of (actionsByScene.get(s.id) ?? []).slice().sort((x, y) => x.startTime - y.startTime)) {
      laneFor(a.actor).items.push({
        action: a.action,
        target: a.target ?? undefined,
        startTime: a.startTime,
        endTime: a.endTime,
        duration: a.duration,
        error: a.error,
        status: laneStatus(a),
      })
    }
    return {
      name: s.name,
      file: s.file,
      actors: s.actors.slice(),
      lanes,
      assertions: (assertionsByScene.get(s.id) ?? []).map((a) => ({
        actor: a.actor ?? undefined,
        description: a.description,
        result: a.result,
        timestamp: a.timestamp,
      })),
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      duration: s.duration ?? undefined,
      error: s.error ?? undefined,
      team: s.team,
      teamIndex: s.teamIndex,
    }
  })

  const teams = [...new Set(slice.scenes.map((s) => s.team?.name).filter((n): n is string => !!n))]
  const completed = slice.run?.completed ?? viewScenes.filter((s) => s.status === 'completed').length
  const failed =
    slice.run?.failed ?? viewScenes.filter((s) => s.status !== 'completed' && s.status !== 'running').length
  const running = slice.run ? slice.run.status === 'running' : viewScenes.some((s) => s.status === 'running')

  return {
    scenes: viewScenes,
    currentSceneIndex: null,
    runStartTime: slice.run?.startTime ?? slice.scenes[0]?.startTime ?? null,
    passCount: completed,
    failCount: failed,
    sceneCount: Math.max(slice.run?.sceneCount ?? 0, viewScenes.length),
    teams,
    running,
    endDurationMs: slice.run?.duration ?? null,
  }
}

/** Number of scenes that have finished (not currently running). */
export function completedSceneCount(state: DashboardState): number {
  return state.scenes.filter((s) => s.status !== 'running').length
}
