import type { RunEvent, TeamMeta } from '@scenetest/protocol'
import {
  scenesProjection,
  assertionsProjection,
  attributeToScene,
  type SceneRow,
  type AssertionRecord,
} from './collections/projections.js'

/**
 * The Runner view's read model. Unlike the Waterfall widget (which folds its
 * own `store.ts` shape for lane/timeline rendering), the Runner is built on the
 * shared collection **projections** — the same pure folds the cloud read model
 * uses — plus `attributeToScene`, so per-scene assertions are attributed the
 * way the collections define it (stamped scene id, else actor + time-window),
 * not the old "most-recent-running-scene" guess that breaks under concurrency.
 *
 * This deliberately does not pull in `@tanstack/db`: the projections are pure
 * and fold into plain state here for widget reactivity (TanStack DB stays the
 * optional live-query / cloud path — see `collections/`).
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

type ActionEvent = Extract<RunEvent, { type: 'action:start' | 'action:end' }>

function emptySummary(): RunnerSummary {
  return { scenes: 0, completed: 0, failed: 0, assertions: { total: 0, passed: 0, failed: 0 }, warnings: 0 }
}

function isCompleted(status: string): boolean {
  return status === 'completed'
}

function isFailure(status: string): boolean {
  return status !== 'completed' && status !== 'running'
}

/** Pseudo-row so `attributeToScene` can resolve an action event to its scene. */
function actionAttribution(ev: ActionEvent): {
  sceneId: string | null
  runId: string
  actor: string | null
  timestamp: number
} {
  const sceneId =
    ev.scene !== undefined && ev.teamIndex !== undefined
      ? `${ev.runId}:${ev.teamIndex}:${ev.scene}`
      : null
  return { sceneId, runId: ev.runId, actor: ev.actor, timestamp: ev.timestamp }
}

/** Pair start/end action events (per actor+action) into ordered timeline rows. */
function pairTimeline(events: ActionEvent[]): RunnerTimelineEntry[] {
  const open = new Map<string, ActionEvent>()
  const out: RunnerTimelineEntry[] = []
  for (const ev of events) {
    const key = ev.actor + ':' + ev.action
    if (ev.type === 'action:start') {
      open.set(key, ev)
    } else {
      out.push({
        actor: ev.actor,
        action: ev.action,
        target: ev.target,
        duration: ev.duration,
        error: ev.error ?? null,
      })
      open.delete(key)
    }
  }
  for (const ev of open.values()) {
    out.push({ actor: ev.actor, action: ev.action + ' (in flight)', target: ev.target, duration: null, error: null })
  }
  return out
}

/**
 * A mutable fold of the live event stream into the Runner read model. Holds the
 * projection instances (which carry id counters), so it lives outside Preact's
 * pure reducer; the hook subscribes and snapshots it.
 */
export interface RunnerStore {
  ingest(event: RunEvent): void
  reset(): void
  snapshot(): RunnerSnapshot
}

export function createRunnerStore(): RunnerStore {
  let scenesProj = scenesProjection()
  let assertProj = assertionsProjection()
  let sceneRows = new Map<string, SceneRow>()
  let assertions: AssertionRecord[] = []
  let actions: ActionEvent[] = []
  let sceneCount = 0
  let endSummary: RunnerSummary | null = null

  function reset(): void {
    scenesProj = scenesProjection()
    assertProj = assertionsProjection()
    sceneRows = new Map()
    assertions = []
    actions = []
    sceneCount = 0
    endSummary = null
  }

  function ingest(event: RunEvent): void {
    if (event.type === 'run:start') {
      reset()
      sceneCount = event.sceneCount
    }
    for (const op of scenesProj.project(event, (k) => sceneRows.get(k))) {
      if (op.type === 'reset') sceneRows.clear()
      else if (op.type === 'delete') sceneRows.delete(op.key)
      else sceneRows.set(scenesProj.getKey(op.value), op.value)
    }
    for (const op of assertProj.project(event, () => undefined)) {
      if (op.type === 'insert') assertions.push(op.value)
    }
    if (event.type === 'action:start' || event.type === 'action:end') {
      actions.push(event)
    }
    if (event.type === 'run:end' && event.summary) {
      const s = event.summary
      endSummary = {
        scenes: s.scenes,
        completed: s.completed,
        failed: s.failed,
        assertions: { ...s.assertions },
        warnings: s.warnings,
      }
    }
  }

  function snapshot(): RunnerSnapshot {
    const scenes = [...sceneRows.values()].sort((a, b) => a.startTime - b.startTime)
    const view: RunnerScene[] = scenes.map((s) => {
      const sceneAssertions = assertions
        .filter((a) => attributeToScene(a, scenes) === s.id)
        .map((a) => ({ result: a.result, description: a.description, actor: a.actor, timestamp: a.timestamp }))
      const sceneActions = actions.filter((ev) => attributeToScene(actionAttribution(ev), scenes) === s.id)
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
        assertions: sceneAssertions,
        timeline: pairTimeline(sceneActions),
      }
    })

    const computed: RunnerSummary = {
      scenes: Math.max(sceneCount, view.length),
      completed: view.filter((s) => isCompleted(s.status)).length,
      failed: view.filter((s) => isFailure(s.status)).length,
      assertions: {
        total: assertions.length,
        passed: assertions.filter((a) => a.result).length,
        failed: assertions.filter((a) => !a.result).length,
      },
      warnings: 0,
    }
    return { scenes: view, summary: endSummary ?? computed }
  }

  return { ingest, reset, snapshot }
}

// ─── Past-run reports ────────────────────────────────────────────────
//
// Past runs are CLI JSON reports (`/__scenetest/runs/:id`), not event logs, so
// they bypass the projections — the report already nests assertions/timeline
// per scene (attributed by the runner that wrote it). Map defensively into the
// same view shape so the Runner renders live and past runs identically.

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null
const asStr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export function mapReportToSnapshot(report: unknown): RunnerSnapshot {
  if (!isObj(report)) return { scenes: [], summary: emptySummary() }
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
