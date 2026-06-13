import type { TeamMeta } from '@scenetest/protocol'
import type { RowOp, RunProjection } from './types.js'

/**
 * `runId` is the timestamp of the `run:start` that opened the run. Rows from
 * every run of a PR live in one collection, partitioned by this id, so the
 * picker / rollups / flaky detection are queries over the rows rather than
 * separate fetches. A new `run:start` opens a new partition — it does **not**
 * truncate (that was the single-run behaviour; see `docs/.../unified-console.md`).
 */
function runIdOf(timestamp: number): string {
  return String(timestamp)
}

// ─── scenes ──────────────────────────────────────────────────────────

/**
 * Derived current-state of one scene, scoped to its run. Folded from a
 * scene's `scene:start` / `scene:end` pair. The live timeline is
 * `where runId = <latest>`.
 */
export interface SceneRow {
  /** `${runId}:${teamIndex}:${name}` — stable across the scene's start/end. */
  id: string
  runId: string
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

function sceneKey(runId: string, teamIndex: number, name: string): string {
  return `${runId}:${teamIndex}:${name}`
}

export function scenesProjection(): RunProjection<SceneRow, string> {
  let runId = ''
  return {
    id: 'scenes',
    getKey: (row) => row.id,
    project(event, get): Array<RowOp<SceneRow, string>> {
      switch (event.type) {
        case 'run:start':
          runId = runIdOf(event.timestamp)
          return []

        case 'scene:start': {
          const row: SceneRow = {
            id: sceneKey(runId, event.teamIndex, event.name),
            runId,
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
          const prev = get(sceneKey(runId, event.teamIndex, event.name))
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

// ─── assertions ──────────────────────────────────────────────────────

/**
 * One row per inline assertion — the append-only end of the stream, scoped
 * to its run. Keyed by `${runId}:${n}` (a per-projection monotonic index;
 * the stream carries no assertion id).
 */
export interface AssertionRecord {
  id: string
  runId: string
  actor: string | null
  description: string
  result: boolean
  timestamp: number
}

export function assertionsProjection(): RunProjection<AssertionRecord, string> {
  let runId = ''
  let next = 0
  return {
    id: 'assertions',
    getKey: (row) => row.id,
    project(event): Array<RowOp<AssertionRecord, string>> {
      if (event.type === 'run:start') {
        runId = runIdOf(event.timestamp)
        return []
      }
      if (event.type === 'assertion') {
        return [
          {
            type: 'insert',
            value: {
              id: `${runId}:${next++}`,
              runId,
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

// ─── runs ────────────────────────────────────────────────────────────

/**
 * One row per run — the picker, the "most recent" rollup, and (later) flaky
 * detection are all live queries over this table. Folded from `run:start`
 * (insert), `scene:end` (incremental pass/fail counts so the rollup is live),
 * and `run:end` (authoritative counts + duration from the summary).
 *
 * `pr` / `branch` are stamped by the report loader from the filename
 * (`pr-{num}-{timestamp}-…`), not the event stream, so they're absent for a
 * live local run.
 */
export interface RunRow {
  /** runId — the `run:start` timestamp. */
  id: string
  startTime: number
  endTime: number | null
  duration: number | null
  status: 'running' | 'finished' | string
  /** Expected scene count from `run:start`. */
  sceneCount: number
  completed: number
  failed: number
  pr?: number
  branch?: string
}

export function runsProjection(): RunProjection<RunRow, string> {
  let runId = ''
  return {
    id: 'runs',
    getKey: (row) => row.id,
    project(event, get): Array<RowOp<RunRow, string>> {
      switch (event.type) {
        case 'run:start': {
          runId = runIdOf(event.timestamp)
          return [
            {
              type: 'insert',
              value: {
                id: runId,
                startTime: event.timestamp,
                endTime: null,
                duration: null,
                status: 'running',
                sceneCount: event.sceneCount,
                completed: 0,
                failed: 0,
              },
            },
          ]
        }

        case 'scene:end': {
          const prev = get(runId)
          if (!prev) return []
          const passed = event.status === 'completed'
          return [
            {
              type: 'update',
              value: {
                ...prev,
                completed: prev.completed + (passed ? 1 : 0),
                failed: prev.failed + (passed ? 0 : 1),
              },
            },
          ]
        }

        case 'run:end': {
          const prev = get(runId)
          if (!prev) return []
          return [
            {
              type: 'update',
              value: {
                ...prev,
                status: 'finished',
                endTime: event.timestamp,
                duration: event.duration,
                completed: event.summary?.completed ?? prev.completed,
                failed: event.summary?.failed ?? prev.failed,
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
