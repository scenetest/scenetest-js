import type { TeamMeta } from '@scenetest/protocol'
import { groupByScene, type RunSlice } from './select-helpers.js'
import type { ActionItem, Lane } from './types.js'

/**
 * The Runner view's read model — pure selectors over the latest-run `RunSlice`.
 * `selectSnapshot` is the live path; `mapReportToSnapshot` adapts past-run CLI
 * JSON reports into the same shape so live and past runs render identically.
 */

export interface RunnerAssertion {
  result: boolean
  description: string
  actor: string | null
  timestamp: number
}

export interface RunnerTimelineEntry {
  actor: string
  action: string
  target?: string
  duration: number | null
  error: string | null
}

/** One scene with its attributed assertions + per-actor lanes — the unit the view renders. */
export interface RunnerScene {
  id: string
  name: string
  file: string
  line?: number
  status: string
  duration: number | null
  error: string | null
  team: TeamMeta
  teamIndex: number
  actors: string[]
  assertions: RunnerAssertion[]
  /** Flat, time-ordered action list — used for the clipboard payload. */
  timeline: RunnerTimelineEntry[]
  /** Per-actor lanes — the concurrent-actor view shown in the scene detail. */
  lanes: Lane[]
}

export interface RunnerSummary {
  scenes: number
  completed: number
  failed: number
  assertions: { total: number; passed: number; failed: number }
  warnings: number
}

/**
 * Live run controls read this — the state the Runner header needs to drive
 * pause/resume/stop, the progress bar, and the elapsed clock. (Absorbed from
 * the retired Waterfall view.)
 */
export interface RunnerRunState {
  running: boolean
  paused: boolean
  cancelled: boolean
  startTime: number | null
  endDurationMs: number | null
}

export interface RunnerSnapshot {
  scenes: RunnerScene[]
  summary: RunnerSummary
  run: RunnerRunState
}

const EMPTY_RUN: RunnerRunState = {
  running: false,
  paused: false,
  cancelled: false,
  startTime: null,
  endDurationMs: null,
}

export const EMPTY_SNAPSHOT: RunnerSnapshot = {
  scenes: [],
  summary: { scenes: 0, completed: 0, failed: 0, assertions: { total: 0, passed: 0, failed: 0 }, warnings: 0 },
  run: EMPTY_RUN,
}

function isCompleted(status: string): boolean {
  return status === 'completed'
}

function isFailure(status: string): boolean {
  return status !== 'completed' && status !== 'running'
}

/** Classify a lane item for its pill colour, matching the old Waterfall. */
function laneStatus(a: { status?: string; duration: number | null; error: string | null }): ActionItem['status'] {
  if (a.status === 'running') return 'running'
  if (a.status === 'error' || a.error) return 'error'
  return a.duration != null && a.duration > 500 ? 'slow' : 'success'
}

/**
 * Bucket already-classified items into per-actor lanes, seeded by the scene's
 * actor list. The one lane layout shared by the live path (actions) and the
 * past-run path (a report's flat timeline); each caller maps its raw shape into
 * `ActionItem`s (classifying status via `laneStatus`) and hands them here in the
 * order it wants preserved.
 */
function groupLanes(items: Array<{ actor: string } & ActionItem>, seedActors: string[]): Lane[] {
  const lanes: Lane[] = seedActors.map((actor) => ({ actor, items: [] }))
  const byActor = new Map(lanes.map((l) => [l.actor, l]))
  for (const { actor, ...item } of items) {
    let lane = byActor.get(actor)
    if (!lane) {
      lane = { actor, items: [] }
      byActor.set(actor, lane)
      lanes.push(lane)
    }
    lane.items.push(item)
  }
  return lanes
}

/** Build the live snapshot from the latest-run slice: attribute assertions/actions to scenes and roll up the summary. */
export function selectSnapshot(slice: RunSlice): RunnerSnapshot {
  const { run: latestRun, scenes: runScenes, assertions: runAssertions, actions: runActions } = slice

  const assertionsByScene = groupByScene(runAssertions, runScenes)
  const actionsByScene = groupByScene(runActions, runScenes)

  const view: RunnerScene[] = runScenes.map((s) => {
    // Sort the scene's actions once; both the flat timeline and the per-actor
    // lanes want the same ascending-startTime order.
    const actions = (actionsByScene.get(s.id) ?? []).slice().sort((a, b) => a.startTime - b.startTime)
    return {
      id: s.id,
      name: s.name,
      file: s.file,
      status: s.status,
      duration: s.duration,
      error: s.error,
      team: s.team,
      teamIndex: s.teamIndex,
      actors: s.actors,
      assertions: (assertionsByScene.get(s.id) ?? []).map((a) => ({
        result: a.result,
        description: a.description,
        actor: a.actor,
        timestamp: a.timestamp,
      })),
      timeline: actions.map((ac) => ({
        actor: ac.actor,
        action: ac.status === 'running' ? ac.action + ' (in flight)' : ac.action,
        target: ac.target ?? undefined,
        duration: ac.duration,
        error: ac.error,
      })),
      lanes: groupLanes(
        actions.map((ac) => ({
          actor: ac.actor,
          action: ac.action,
          target: ac.target ?? undefined,
          startTime: ac.startTime,
          endTime: ac.endTime,
          duration: ac.duration,
          error: ac.error,
          status: laneStatus(ac),
        })),
        s.actors
      ),
    }
  })

  const summary: RunnerSummary = {
    scenes: Math.max(latestRun?.sceneCount ?? 0, view.length),
    completed: latestRun?.completed ?? view.filter((s) => isCompleted(s.status)).length,
    failed: latestRun?.failed ?? view.filter((s) => isFailure(s.status)).length,
    assertions: {
      total: runAssertions.length,
      passed: runAssertions.filter((a) => a.result).length,
      failed: runAssertions.filter((a) => !a.result).length,
    },
    warnings: 0,
  }
  const run: RunnerRunState = {
    running: latestRun ? latestRun.status === 'running' : view.some((s) => s.status === 'running'),
    paused: latestRun?.paused ?? false,
    cancelled: latestRun?.cancelled ?? false,
    startTime: latestRun?.startTime ?? runScenes[0]?.startTime ?? null,
    endDurationMs: latestRun?.duration ?? null,
  }
  return { scenes: view, summary, run }
}

// ─── Past-run reports ────────────────────────────────────────────────
//
// Past runs are CLI JSON reports (`/__scenetest/runs/:id`), not event logs, so
// they bypass the collections — the report already nests assertions/timeline
// per scene (attributed by the runner that wrote it). Map defensively into the
// same view shape so the Runner renders live and past runs identically.

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null
const asStr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export function mapReportToSnapshot(report: unknown): RunnerSnapshot {
  if (!isObj(report)) return EMPTY_SNAPSHOT
  const rawScenes = Array.isArray(report.scenes) ? report.scenes : []
  const scenes: RunnerScene[] = rawScenes.filter(isObj).map((s, i) => {
    const team = isObj(s.team) ? (s.team as TeamMeta) : {}
    const teamIndex = asNum(s.teamIndex) ?? 0
    return {
      id: `${asStr(s.name, 'scene')}:${teamIndex}:${i}`,
      name: asStr(s.name, '(unnamed)'),
      file: asStr(s.file),
      line: asNum(s.line) ?? undefined,
      status: asStr(s.status, 'completed'),
      duration: asNum(s.duration),
      error: typeof s.error === 'string' ? s.error : null,
      team,
      teamIndex,
      actors: Array.isArray(s.actors) ? s.actors.filter((a): a is string => typeof a === 'string') : [],
      assertions: (Array.isArray(s.assertions) ? s.assertions : []).filter(isObj).map((a) => ({
        result: a.result === true,
        description: asStr(a.description),
        actor: typeof a.actor === 'string' ? a.actor : null,
        timestamp: asNum(a.timestamp) ?? 0,
      })),
      timeline: (Array.isArray(s.timeline) ? s.timeline : []).filter(isObj).map((t) => ({
        actor: asStr(t.actor),
        action: asStr(t.action),
        target: typeof t.target === 'string' ? t.target : undefined,
        duration: asNum(t.duration),
        error: typeof t.error === 'string' ? t.error : null,
      })),
      lanes: lanesFromTimeline((Array.isArray(s.timeline) ? s.timeline : []).filter(isObj)),
    }
  })

  const rs = isObj(report.summary) ? report.summary : {}
  const ra = isObj(rs.assertions) ? rs.assertions : {}
  const summary: RunnerSummary = {
    scenes: asNum(rs.scenes) ?? scenes.length,
    completed: asNum(rs.completed) ?? scenes.filter((s) => isCompleted(s.status)).length,
    failed: asNum(rs.failed) ?? scenes.filter((s) => isFailure(s.status)).length,
    assertions: {
      total: asNum(ra.total) ?? 0,
      passed: asNum(ra.passed) ?? 0,
      failed: asNum(ra.failed) ?? 0,
    },
    warnings: asNum(rs.warnings) ?? 0,
  }
  // A past run is finished by definition — no live controls, but keep the
  // final duration/cancelled so the header can show them.
  const run: RunnerRunState = {
    running: false,
    paused: false,
    cancelled: rs.cancelled === true,
    startTime: asNum(report.startTime) ?? null,
    endDurationMs: asNum(rs.duration) ?? asNum(report.duration),
  }
  return { scenes, summary, run }
}

/** Build per-actor lanes from a past run's flat, pre-ordered timeline. */
function lanesFromTimeline(timeline: Raw[]): Lane[] {
  const items = timeline
    .map((t) => {
      const duration = asNum(t.duration)
      const error = typeof t.error === 'string' ? t.error : null
      return {
        actor: asStr(t.actor),
        action: asStr(t.action),
        target: typeof t.target === 'string' ? t.target : undefined,
        startTime: 0,
        endTime: null,
        duration,
        error,
        status: laneStatus({ duration, error }),
      }
    })
    .filter((it) => it.actor) // drop actor-less rows (nothing to attribute)
  return groupLanes(items, [])
}
