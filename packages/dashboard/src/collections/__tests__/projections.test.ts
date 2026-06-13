import { describe, it, expect } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import { assertionsProjection, runsProjection, scenesProjection } from '../projections.js'
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

const runStart = (ts: number, sceneCount = 1): RunEvent => ({ type: 'run:start', timestamp: ts, sceneCount })
const sceneStart = (name: string, ts: number, teamIndex = 0): RunEvent => ({
  type: 'scene:start',
  timestamp: ts,
  name,
  file: `${name}.scene.ts`,
  actors: ['alice'],
  teamIndex,
  team: { name: teamIndex === 0 ? 'fr' : 'de' },
})
const sceneEnd = (name: string, status: string, ts: number, teamIndex = 0): RunEvent => ({
  type: 'scene:end',
  timestamp: ts,
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
      sceneStart('login', 102),
      sceneEnd('login', 'completed', 140),
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
      sceneStart('a', 101),
      sceneEnd('a', 'completed', 110),
      runStart(200),
      sceneStart('a', 201),
    ])
    expect([...rows.keys()].sort()).toEqual(['100:0:a', '200:0:a'])
    expect(rows.get('100:0:a')).toMatchObject({ runId: '100', status: 'completed' })
    expect(rows.get('200:0:a')).toMatchObject({ runId: '200', status: 'running' })
  })

  it('keeps same-named scenes from different teams distinct within a run', () => {
    const rows = replay(scenesProjection(), [runStart(5), sceneStart('home', 6, 0), sceneStart('home', 7, 1)])
    expect([...rows.keys()].sort()).toEqual(['5:0:home', '5:1:home'])
  })

  it('ignores a scene:end with no matching start', () => {
    const rows = replay(scenesProjection(), [runStart(5), sceneEnd('ghost', 'failed', 6)])
    expect(rows.size).toBe(0)
  })
})

describe('assertionsProjection (multi-run)', () => {
  it('appends one row per assertion, keyed and tagged by runId', () => {
    const rows = replay(assertionsProjection(), [
      runStart(100),
      { type: 'assertion', timestamp: 101, actor: 'alice', description: 'logged in', result: true },
      runStart(200),
      { type: 'assertion', timestamp: 201, description: 'cart empty', result: false },
    ])
    expect([...rows.keys()]).toEqual(['100:0', '200:1'])
    expect(rows.get('100:0')).toMatchObject({ runId: '100', actor: 'alice', result: true })
    expect(rows.get('200:1')).toMatchObject({ runId: '200', actor: null, description: 'cart empty' })
  })
})

describe('runsProjection', () => {
  it('inserts a running row on run:start and finalizes it on run:end', () => {
    const rows = replay(runsProjection(), [
      runStart(100, 2),
      {
        type: 'run:end',
        timestamp: 999,
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
    const rows = replay(proj, [runStart(100, 2), sceneEnd('a', 'completed', 110), sceneEnd('b', 'failed', 120)])
    expect(rows.get('100')).toMatchObject({ status: 'running', completed: 1, failed: 1 })
  })

  it('tracks one row per run', () => {
    const rows = replay(runsProjection(), [runStart(100), runStart(200), runStart(300)])
    expect([...rows.keys()].sort()).toEqual(['100', '200', '300'])
    expect(rows.get('200')).toMatchObject({ status: 'running' })
  })
})
