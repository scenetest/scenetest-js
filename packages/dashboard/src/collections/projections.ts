import type { TeamMeta } from '@scenetest/protocol'
import type { RowOp, RunProjection } from './types.js'

/**
 * Derived current-state of one scene — the natural row shape (latest op per
 * key) the proposal contrasts with the raw event timeline. Folded from a
 * scene's `scene:start` / `scene:end` pair.
 */
export interface SceneRow {
  /** `${teamIndex}:${name}` — stable across the scene's start and end. */
  id: string
  name: string
  file: string
  actors: string[]
  status: 'running' | 'completed' | 'failed' | 'timeout' | string
  startTime: number
  endTime: number | null
  duration: number | null
  error: string | null
  team: TeamMeta
  teamIndex: number
}

/** A scene's stable key — name is unique within a team for a run. */
function sceneKey(teamIndex: number, name: string): string {
  return `${teamIndex}:${name}`
}

/**
 * Projects scene lifecycle events into one row per scene. `run:start` resets
 * the table; `scene:start` inserts a running row; `scene:end` updates it in
 * place to its terminal status — so a `useLiveQuery` grouping by `status`
 * recomputes incrementally as each scene finishes.
 */
export function scenesProjection(): RunProjection<SceneRow, string> {
  return {
    id: 'scenes',
    getKey: (row) => row.id,
    project(event, get): Array<RowOp<SceneRow, string>> {
      switch (event.type) {
        case 'run:start':
          return [{ type: 'reset' }]

        case 'scene:start': {
          const row: SceneRow = {
            id: sceneKey(event.teamIndex, event.name),
            name: event.name,
            file: event.file,
            actors: event.actors.slice(),
            status: 'running',
            startTime: event.timestamp,
            endTime: null,
            duration: null,
            error: null,
            team: event.team,
            teamIndex: event.teamIndex,
          }
          return [{ type: 'insert', value: row }]
        }

        case 'scene:end': {
          const prev = get(sceneKey(event.teamIndex, event.name))
          if (!prev) return []
          return [
            {
              type: 'update',
              value: {
                ...prev,
                status: event.status,
                endTime: event.timestamp,
                duration: event.duration,
                error: event.error ?? null,
              },
            },
          ]
        }

        default:
          return []
      }
    },
  }
}

/**
 * One row per inline assertion — the append-only end of the stream, where
 * every intermediate state matters. Rows are keyed by a per-run monotonic
 * index (the stream carries no assertion id), reset on `run:start`.
 */
export interface AssertionRecord {
  id: string
  actor: string | null
  description: string
  result: boolean
  timestamp: number
}

export function assertionsProjection(): RunProjection<AssertionRecord, string> {
  let next = 0
  return {
    id: 'assertions',
    getKey: (row) => row.id,
    project(event): Array<RowOp<AssertionRecord, string>> {
      if (event.type === 'run:start') {
        next = 0
        return [{ type: 'reset' }]
      }
      if (event.type === 'assertion') {
        return [
          {
            type: 'insert',
            value: {
              id: String(next++),
              actor: event.actor ?? null,
              description: event.description,
              result: event.result,
              timestamp: event.timestamp,
            },
          },
        ]
      }
      return []
    },
  }
}
