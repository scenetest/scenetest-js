import { describe, it, expect } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import { assertionsProjection, scenesProjection } from '../projections.js'
import type { RowOp, RunProjection } from '../types.js'

/**
 * Replay events through a projection against an in-memory map — the same
 * fold the sync layer performs, but standalone, so projections are testable
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

describe('scenesProjection', () => {
  it('inserts a running row on scene:start and updates it in place on scene:end', () => {
    const rows = replay(scenesProjection(), [
      sceneStart('login', 2),
      sceneEnd('login', 'completed', 40),
    ])
    expect(rows.size).toBe(1)
    const scene = rows.get('0:login')!
    expect(scene).toMatchObject({
      name: 'login',
      status: 'completed',
      startTime: 2,
      endTime: 40,
      duration: 40,
    })
  })

  it('keeps same-named scenes from different teams as distinct rows', () => {
    const rows = replay(scenesProjection(), [
      sceneStart('home', 1, 0),
      sceneStart('home', 2, 1),
    ])
    expect([...rows.keys()].sort()).toEqual(['0:home', '1:home'])
  })

  it('ignores a scene:end with no matching start', () => {
    const rows = replay(scenesProjection(), [sceneEnd('ghost', 'failed', 5)])
    expect(rows.size).toBe(0)
  })

  it('resets every row on run:start', () => {
    const rows = replay(scenesProjection(), [
      sceneStart('a', 1),
      { type: 'run:start', timestamp: 10, sceneCount: 1 },
      sceneStart('b', 11),
    ])
    expect([...rows.keys()]).toEqual(['0:b'])
  })

  it('carries the failed scene status and error onto the row', () => {
    const rows = replay(scenesProjection(), [
      sceneStart('checkout', 1),
      { type: 'scene:end', timestamp: 5, name: 'checkout', status: 'failed', duration: 4, error: 'boom', teamIndex: 0, team: {} },
    ])
    expect(rows.get('0:checkout')).toMatchObject({ status: 'failed', error: 'boom' })
  })
})

describe('assertionsProjection', () => {
  it('appends one row per assertion with monotonic keys', () => {
    const rows = replay(assertionsProjection(), [
      { type: 'assertion', timestamp: 1, actor: 'alice', description: 'logged in', result: true },
      { type: 'assertion', timestamp: 2, description: 'cart empty', result: false },
    ])
    expect([...rows.keys()]).toEqual(['0', '1'])
    expect(rows.get('0')).toMatchObject({ actor: 'alice', description: 'logged in', result: true })
    expect(rows.get('1')).toMatchObject({ actor: null, description: 'cart empty', result: false })
  })

  it('resets rows and the key counter on run:start', () => {
    const rows = replay(assertionsProjection(), [
      { type: 'assertion', timestamp: 1, description: 'a', result: true },
      { type: 'run:start', timestamp: 5, sceneCount: 1 },
      { type: 'assertion', timestamp: 6, description: 'b', result: true },
    ])
    expect([...rows.keys()]).toEqual(['0'])
    expect(rows.get('0')).toMatchObject({ description: 'b' })
  })

  it('ignores events that are not assertions', () => {
    const rows = replay(assertionsProjection(), [sceneStart('x', 1), sceneEnd('x', 'completed', 2)])
    expect(rows.size).toBe(0)
  })
})
