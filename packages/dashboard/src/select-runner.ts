import type { TeamMeta } from '@scenetest/protocol'
import { groupByScene, type RunSlice } from './select-helpers.js'

/**
 * The Runner view's read model — derived from the shared `@tanstack/db`
 * collections (scenes / assertions / actions / runs) the console builds from
 * the run stream. The collections are the canonical fold; this module is a
 * pure *selector* over their rows plus `attributeToScene`, so per-scene
 * assertions/timeline are attributed the way the collections define it
 * (stamped scene id, else actor + time-window) rather than the old
 * "most-recent-running-scene" guess that breaks under concurrency.
 *
 * `selectSnapshot` is pure (testable without a live collection); `runner.ts`
 * feeds it `collection.toArray` and re-runs it on change. Past runs bypass the
 * collections — they're CLI JSON reports — via `mapReportToSnapshot`.
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

/** One scene with its attributed assertions + timeline — the unit the view renders. */
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
  timeline: RunnerTimelineEntry[]
}

export interface RunnerSummary {
  scenes: number
  completed: number
  failed: number
  assertions: { total: number; passed: number; failed: number }
  warnings: number
}

export interface RunnerSnapshot {
  scenes: RunnerScene[]
  summary: RunnerSummary
}

export const EMPTY_SNAPSHOT: RunnerSnapshot = {
  scenes: [],
  summary: { scenes: 0, completed: 0, failed: 0, assertions: { total: 0, passed: 0, failed: 0 }, warnings: 0 },
}

function isCompleted(status: string): boolean {
  return status === 'completed'
}

function isFailure(status: string): boolean {
  return status !== 'completed' && status !== 'running'
}

/**
 * Build the live snapshot from the latest-run {@link RunSlice}. The collections
 * are multi-run (they accumulate every run of the session), so the live Runner
 * shows the **latest** run — the slice `where runId = latest` — exactly as the
 * unified-console design frames the live timeline. The slice is built
 * incrementally by `useRunSlice`'s live-query collections (or by
 * `latestRunSlice` in tests); this selector only attributes and rolls up.
 */
export function selectSnapshot(slice: RunSlice): RunnerSnapshot {
  const { run: latestRun, scenes: runScenes, assertions: runAssertions, actions: runActions } = slice

  const assertionsByScene = groupByScene(runAssertions, runScenes)
  const actionsByScene = groupByScene(runActions, runScenes)

  const view: RunnerScene[] = runScenes.map((s) => ({
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
    timeline: (actionsByScene.get(s.id) ?? [])
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map((ac) => ({
        actor: ac.actor,
        action: ac.status === 'running' ? ac.action + ' (in flight)' : ac.action,
        target: ac.target ?? undefined,
        duration: ac.duration,
        error: ac.error,
      })),
  }))

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
  return { scenes: view, summary }
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
  return { scenes, summary }
}
