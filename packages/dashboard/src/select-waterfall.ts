import { attributeToScene } from './collections/projections.js'
import type { ActionRecord } from './collections/projections.js'
import type { ActionItem, DashboardState, Lane, Scene } from './types.js'
import type { RunSlice } from './select-helpers.js'

/** The empty state, before any rows exist. */
export function initialState(): DashboardState {
  return {
    scenes: [],
    currentSceneIndex: null,
    runStartTime: null,
    passCount: 0,
    failCount: 0,
    sceneCount: 0,
    teams: [],
    running: false,
    endDurationMs: null,
    connection: 'connecting',
  }
}

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
 */
export function selectWaterfall(slice: RunSlice): DashboardState {
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
    for (const a of slice.actions
      .filter((ac) => attributeToScene(ac, slice.scenes) === s.id)
      .sort((x, y) => x.startTime - y.startTime)) {
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
      assertions: slice.assertions
        .filter((a) => attributeToScene(a, slice.scenes) === s.id)
        .map((a) => ({ actor: a.actor ?? undefined, description: a.description, result: a.result, timestamp: a.timestamp })),
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
    connection: 'connecting',
  }
}

/** Number of scenes that have finished (not currently running). */
export function completedSceneCount(state: DashboardState): number {
  return state.scenes.filter((s) => s.status !== 'running').length
}
