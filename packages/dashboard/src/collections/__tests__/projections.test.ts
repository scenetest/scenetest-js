import { describe, it, expect } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import {
  assertionsProjection,
  actionsProjection,
  runsProjection,
  scenesProjection,
  attributeToScene,
  type SceneRow,
} from '../projections.js'
import type { RowOp, RunProjection } from '../types.js'

/**
 * Replay events through a projection against an in-memory map — the same
 * fold the sync layer performs, standalone, so projections are testable
 * without TanStack DB.
 */
function replay<T extends object, TKey extends string | number>(
  projection: RunProjection<T, TKey>,
  events: RunEvent[]
): Map<TKey, T> {
  const rows = new Map<TKey, T>()
  for (const event of events) {
    for (const op of projection.project(event, (k) => rows.get(k))) {
      apply(projection, rows, op)
    }
  }
  return rows
}

function apply<T extends object, TKey extends string | number>(
  projection: RunProjection<T, TKey>,
  rows: Map<TKey, T>,
  op: RowOp<T, TKey>
): void {
  if (op.type === 'reset') rows.clear()
  else if (op.type === 'delete') rows.delete(op.key)
  else rows.set(projection.getKey(op.value), op.value)
}

// runId defaults to the run:start timestamp, matching what producers stamp;
// scene/assertion helpers take the runId of the run they belong to.
const runStart = (ts: number, sceneCount = 1): RunEvent => ({
  type: 'run:start',
  timestamp: ts,
  runId: String(ts),
  sceneCount,
})
const sceneStart = (runId: string, name: string, ts: number, teamIndex = 0): RunEvent => ({
  type: 'scene:start',
  timestamp: ts,
  runId,
  name,
  file: `${name}.scene.ts`,
  actors: ['alice'],
  teamIndex,
  team: { name: teamIndex === 0 ? 'fr' : 'de' },
})
const sceneEnd = (runId: string, name: string, status: string, ts: number, teamIndex = 0): RunEvent => ({
  type: 'scene:end',
  timestamp: ts,
  runId,
  name,
  status,
  duration: ts,
  teamIndex,
  team: {},
})

describe('scenesProjection (multi-run, runId-partitioned)', () => {
  it('keys scenes by runId and updates in place on scene:end', () => {
    const rows = replay(scenesProjection(), [
      runStart(100),
      sceneStart('100', 'login', 102),
      sceneEnd('100', 'login', 'completed', 140),
    ])
    expect(rows.size).toBe(1)
    expect(rows.get('100:0:login')).toMatchObject({
      runId: '100',
      name: 'login',
      status: 'completed',
      duration: 140,
    })
  })

  it('keeps scenes from prior runs when a new run:start arrives (no truncate)', () => {
    const rows = replay(scenesProjection(), [
      runStart(100),
      sceneStart('100', 'a', 101),
      sceneEnd('100', 'a', 'completed', 110),
      runStart(200),
      sceneStart('200', 'a', 201),
    ])
    expect([...rows.keys()].sort()).toEqual(['100:0:a', '200:0:a'])
    expect(rows.get('100:0:a')).toMatchObject({ runId: '100', status: 'completed' })
    expect(rows.get('200:0:a')).toMatchObject({ runId: '200', status: 'running' })
  })

  it('keeps same-named scenes from different teams distinct within a run', () => {
    const rows = replay(scenesProjection(), [runStart(5), sceneStart('5', 'home', 6, 0), sceneStart('5', 'home', 7, 1)])
    expect([...rows.keys()].sort()).toEqual(['5:0:home', '5:1:home'])
  })

  it('ignores a scene:end with no matching start', () => {
    const rows = replay(scenesProjection(), [runStart(5), sceneEnd('5', 'ghost', 'failed', 6)])
    expect(rows.size).toBe(0)
  })

  it('partitions by the runId on the event, even without a preceding run:start (mid-stream attach)', () => {
    // A collection attaching after run:start still keys correctly off the event.
    const rows = replay(scenesProjection(), [sceneStart('900', 'late', 901), sceneEnd('900', 'late', 'completed', 910)])
    expect(rows.get('900:0:late')).toMatchObject({ runId: '900', status: 'completed' })
  })
})

describe('assertionsProjection (multi-run)', () => {
  it('appends one row per assertion, keyed and tagged by runId', () => {
    const rows = replay(assertionsProjection(), [
      runStart(100),
      { type: 'assertion', timestamp: 101, runId: '100', actor: 'alice', description: 'logged in', result: true },
      runStart(200),
      { type: 'assertion', timestamp: 201, runId: '200', description: 'cart empty', result: false },
    ])
    expect([...rows.keys()]).toEqual(['100:0', '200:1'])
    expect(rows.get('100:0')).toMatchObject({ runId: '100', actor: 'alice', result: true, sceneId: null })
    expect(rows.get('200:1')).toMatchObject({ runId: '200', actor: null, description: 'cart empty', sceneId: null })
  })

  it('derives sceneId when the producer stamped scene + teamIndex', () => {
    const rows = replay(assertionsProjection(), [
      runStart(100),
      { type: 'assertion', timestamp: 101, runId: '100', actor: 'alice', description: 'x', result: true, scene: 'login', teamIndex: 1 },
    ])
    expect(rows.get('100:0')).toMatchObject({ sceneId: '100:1:login' })
  })

  it('leaves sceneId null when only one of scene/teamIndex is present', () => {
    const rows = replay(assertionsProjection(), [
      { type: 'assertion', timestamp: 1, runId: '100', description: 'x', result: true, scene: 'login' },
    ])
    expect(rows.get('100:0')).toMatchObject({ sceneId: null })
  })
})

describe('attributeToScene', () => {
  const scene = (over: Partial<SceneRow>): SceneRow => ({
    id: '100:0:login',
    runId: '100',
    name: 'login',
    file: 'login.scene.ts',
    actors: ['alice'],
    status: 'completed',
    startTime: 100,
    endTime: 200,
    duration: 100,
    error: null,
    team: {},
    teamIndex: 0,
    ...over,
  })

  it('prefers a stamped sceneId without consulting scenes', () => {
    const id = attributeToScene(
      { sceneId: '100:0:login', runId: '100', actor: null, timestamp: 0 },
      []
    )
    expect(id).toBe('100:0:login')
  })

  it('falls back to actor + time-window for unstamped rows', () => {
    const scenes = [scene({})]
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: 'alice', timestamp: 150 }, scenes)
    ).toBe('100:0:login')
  })

  it('does not attribute outside the scene window', () => {
    const scenes = [scene({})]
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: 'alice', timestamp: 250 }, scenes)
    ).toBeNull()
  })

  it('treats a still-running scene (endTime null) as open-ended', () => {
    const scenes = [scene({ endTime: null, status: 'running' })]
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: 'alice', timestamp: 9999 }, scenes)
    ).toBe('100:0:login')
  })

  it('matches by actor across concurrent scenes of the same run', () => {
    const scenes = [
      scene({ id: '100:0:login', actors: ['alice'], teamIndex: 0 }),
      scene({ id: '100:1:checkout', name: 'checkout', actors: ['bob'], teamIndex: 1 }),
    ]
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: 'bob', timestamp: 150 }, scenes)
    ).toBe('100:1:checkout')
  })

  it('returns null for an actor-less unstamped assertion (ambient)', () => {
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: null, timestamp: 150 }, [scene({})])
    ).toBeNull()
  })

  it('does not attribute across runs', () => {
    const scenes = [scene({ runId: '999' })]
    expect(
      attributeToScene({ sceneId: null, runId: '100', actor: 'alice', timestamp: 150 }, scenes)
    ).toBeNull()
  })
})

describe('actionsProjection', () => {
  it('pairs action:start/end into one row with duration, status, and stamped sceneId', () => {
    const rows = replay(actionsProjection(), [
      { type: 'action:start', timestamp: 10, runId: '1', actor: 'a', action: 'click', target: 'go', scene: 'login', teamIndex: 0 },
      { type: 'action:end', timestamp: 25, runId: '1', actor: 'a', action: 'click', target: 'go', duration: 15 },
    ])
    expect([...rows.values()]).toHaveLength(1)
    expect(rows.get('1:0')).toMatchObject({
      actor: 'a',
      action: 'click',
      startTime: 10,
      endTime: 25,
      duration: 15,
      status: 'success',
      sceneId: '1:0:login',
    })
  })

  it('marks an errored action and leaves an unfinished one running', () => {
    const rows = replay(actionsProjection(), [
      { type: 'action:start', timestamp: 1, runId: '1', actor: 'a', action: 'fill' },
      { type: 'action:end', timestamp: 2, runId: '1', actor: 'a', action: 'fill', duration: 1, error: 'boom' },
      { type: 'action:start', timestamp: 3, runId: '1', actor: 'a', action: 'wait' },
    ])
    expect(rows.get('1:0')).toMatchObject({ status: 'error', error: 'boom' })
    expect(rows.get('1:1')).toMatchObject({ status: 'running', endTime: null, sceneId: null })
  })

  it('ignores an action:end with no matching open start', () => {
    const rows = replay(actionsProjection(), [
      { type: 'action:end', timestamp: 2, runId: '1', actor: 'a', action: 'ghost', duration: 1 },
    ])
    expect(rows.size).toBe(0)
  })
})

describe('runsProjection', () => {
  it('inserts a running row on run:start and finalizes it on run:end', () => {
    const rows = replay(runsProjection(), [
      runStart(100, 2),
      {
        type: 'run:end',
        timestamp: 999,
        runId: '100',
        duration: 1234,
        summary: { scenes: 2, completed: 1, failed: 1, assertions: { total: 3, passed: 2, failed: 1 }, warnings: 0, consoleErrors: 0 },
      },
    ])
    expect(rows.get('100')).toMatchObject({
      id: '100',
      status: 'finished',
      sceneCount: 2,
      completed: 1,
      failed: 1,
      duration: 1234,
      endTime: 999,
    })
  })

  it('increments pass/fail counts live as scenes finish', () => {
    const proj = runsProjection()
    const rows = replay(proj, [runStart(100, 2), sceneEnd('100', 'a', 'completed', 110), sceneEnd('100', 'b', 'failed', 120)])
    expect(rows.get('100')).toMatchObject({ status: 'running', completed: 1, failed: 1 })
  })

  it('tracks one row per run', () => {
    const rows = replay(runsProjection(), [runStart(100), runStart(200), runStart(300)])
    expect([...rows.keys()].sort()).toEqual(['100', '200', '300'])
    expect(rows.get('200')).toMatchObject({ status: 'running' })
  })
})
