import type { RunEvent } from '@scenetest/protocol'
import type { ConnectionStatus, DashboardState, Lane, Scene } from './types.js'

/** The empty state, before any events. */
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

function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    actors: scene.actors.slice(),
    lanes: scene.lanes.map((lane) => ({ actor: lane.actor, items: lane.items.slice() })),
    assertions: scene.assertions.slice(),
  }
}

function laneFor(scene: Scene, actor: string): Lane {
  let lane = scene.lanes.find((l) => l.actor === actor)
  if (!lane) {
    lane = { actor, items: [] }
    scene.lanes.push(lane)
    if (!scene.actors.includes(actor)) scene.actors.push(actor)
  }
  return lane
}

/**
 * Fold one protocol event into the state, returning a new state object (and
 * new objects for the scenes/scene that changed) so Preact re-renders. This
 * is the same reduction the original inline dashboard did imperatively, made
 * pure. Unknown event types are ignored — a newer producer can add events
 * without breaking an older widget.
 */
export function applyEvent(state: DashboardState, event: RunEvent): DashboardState {
  switch (event.type) {
    case 'run:start':
      return {
        ...initialState(),
        connection: state.connection,
        runStartTime: event.timestamp,
        sceneCount: event.sceneCount,
        running: true,
      }

    case 'scene:start': {
      const scene: Scene = {
        name: event.name,
        file: event.file,
        actors: (event.actors ?? []).slice(),
        lanes: (event.actors ?? []).map((actor) => ({ actor, items: [] })),
        assertions: [],
        startTime: event.timestamp,
        endTime: null,
        status: 'running',
        team: event.team ?? {},
        teamIndex: event.teamIndex ?? 0,
      }
      const scenes = state.scenes.concat(scene)
      const teamName = scene.team?.name
      const teams =
        teamName && !state.teams.includes(teamName) ? state.teams.concat(teamName) : state.teams
      return { ...state, scenes, currentSceneIndex: scenes.length - 1, teams }
    }

    case 'action:start': {
      return updateCurrentScene(state, (scene) => {
        const lane = laneFor(scene, event.actor)
        lane.items.push({
          action: event.action,
          target: event.target,
          startTime: event.timestamp,
          endTime: null,
          duration: null,
          error: null,
          status: 'running',
        })
      })
    }

    case 'action:end': {
      return updateCurrentScene(state, (scene) => {
        const lane = scene.lanes.find((l) => l.actor === event.actor)
        if (!lane) return
        for (let i = lane.items.length - 1; i >= 0; i--) {
          const item = lane.items[i]
          if (item.status === 'running' && item.action === event.action) {
            item.endTime = event.timestamp
            item.duration = event.duration
            item.error = event.error ?? null
            item.status = event.error ? 'error' : event.duration > 500 ? 'slow' : 'success'
            break
          }
        }
      })
    }

    case 'assertion': {
      return updateCurrentScene(state, (scene) => {
        scene.assertions.push({
          actor: event.actor,
          description: event.description,
          result: event.result,
          timestamp: event.timestamp,
        })
      })
    }

    case 'scene:end': {
      if (state.currentSceneIndex == null) return state
      const next = updateCurrentScene(state, (scene) => {
        scene.endTime = event.timestamp
        scene.status = event.status
        scene.duration = event.duration
        scene.error = event.error
      })
      const passed = event.status === 'completed'
      return {
        ...next,
        currentSceneIndex: null,
        passCount: next.passCount + (passed ? 1 : 0),
        failCount: next.failCount + (passed ? 0 : 1),
      }
    }

    case 'run:progress':
      return { ...state, progress: { pct: event.pct, failing: event.failing, flaky: event.flaky } }

    case 'run:end':
      return {
        ...state,
        running: false,
        sceneCount: event.summary?.scenes ?? state.sceneCount,
        passCount: event.summary?.completed ?? state.passCount,
        failCount: event.summary?.failed ?? state.failCount,
        endDurationMs: event.duration,
      }

    default:
      return state
  }
}

function updateCurrentScene(state: DashboardState, mutate: (scene: Scene) => void): DashboardState {
  const idx = state.currentSceneIndex
  if (idx == null || idx < 0 || idx >= state.scenes.length) return state
  const scene = cloneScene(state.scenes[idx])
  mutate(scene)
  const scenes = state.scenes.slice()
  scenes[idx] = scene
  return { ...state, scenes }
}

/** Fold a snapshot of events into a fresh state, in order. */
export function foldEvents(events: RunEvent[]): DashboardState {
  return events.reduce(applyEvent, initialState())
}

/** Return a new state with the connection liveness updated. */
export function withConnection(state: DashboardState, connection: ConnectionStatus): DashboardState {
  return { ...state, connection }
}

/** Number of scenes that have finished (not currently running). */
export function completedSceneCount(state: DashboardState): number {
  return state.scenes.filter((s) => s.status !== 'running').length
}
