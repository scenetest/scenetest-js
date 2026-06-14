import { describe, it, expect } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import { selectWaterfall, completedSceneCount } from '../select-waterfall.js'
import { latestRunSlice } from '../select-helpers.js'
import {
  scenesProjection,
  assertionsProjection,
  actionsProjection,
  runsProjection,
  type RunProjection,
} from '../collections/index.js'

// Replay events through a projection into a row array — the same fold the
// @tanstack/db sync layer performs, so we can test selectWaterfall (the
// Waterfall reading the store) over realistic rows without a live collection.
function fold<T extends object, K extends string | number>(proj: RunProjection<T, K>, events: RunEvent[]): T[] {
  const m = new Map<K, T>()
  for (const e of events) {
    for (const op of proj.project(e, (k) => m.get(k))) {
      if (op.type === 'reset') m.clear()
      else if (op.type === 'delete') m.delete(op.key)
      else m.set(proj.getKey(op.value), op.value)
    }
  }
  return [...m.values()]
}

function project(events: RunEvent[]) {
  // The live views feed `selectWaterfall` a latest-run slice built by
  // `useRunSlice`'s live-query collections; here we build the same slice with
  // the pure `latestRunSlice` over folded rows, so the selector sees the
  // identical shape without a live collection.
  return selectWaterfall(
    latestRunSlice(
      fold(scenesProjection(), events),
      fold(assertionsProjection(), events),
      fold(actionsProjection(), events),
      fold(runsProjection(), events)
    )
  )
}

describe('selectWaterfall (the Waterfall reading the store)', () => {
  it('projects scenes, lanes, assertions, and counts from the collection rows', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 2 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 'login', file: 'login.scene.ts', actors: ['alice'], teamIndex: 0, team: { name: 'fr' } },
      { type: 'action:start', timestamp: 3, runId: '1', actor: 'alice', action: 'typeInto', target: 'password' },
      { type: 'action:end', timestamp: 4, runId: '1', actor: 'alice', action: 'typeInto', target: 'password', duration: 12 },
      { type: 'assertion', timestamp: 5, runId: '1', actor: 'alice', description: 'logged in', result: true },
      { type: 'scene:end', timestamp: 6, runId: '1', name: 'login', status: 'completed', duration: 40, teamIndex: 0, team: { name: 'fr' } },
    ])

    expect(state.running).toBe(true) // no run:end yet
    expect(state.sceneCount).toBe(2)
    expect(state.passCount).toBe(1)
    expect(state.failCount).toBe(0)
    expect(state.teams).toEqual(['fr'])
    expect(state.scenes).toHaveLength(1)

    const scene = state.scenes[0]
    expect(scene.status).toBe('completed')
    expect(scene.duration).toBe(40)
    expect(scene.lanes[0].actor).toBe('alice')
    expect(scene.lanes[0].items[0]).toMatchObject({ action: 'typeInto', target: 'password', status: 'success', duration: 12 })
    expect(scene.assertions[0]).toMatchObject({ description: 'logged in', result: true })
  })

  it('marks slow and errored actions by duration and error', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 's', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
      { type: 'action:start', timestamp: 3, runId: '1', actor: 'a', action: 'wait' },
      { type: 'action:end', timestamp: 4, runId: '1', actor: 'a', action: 'wait', duration: 900 },
      { type: 'action:start', timestamp: 5, runId: '1', actor: 'a', action: 'click', target: 'submit' },
      { type: 'action:end', timestamp: 6, runId: '1', actor: 'a', action: 'click', target: 'submit', duration: 10, error: 'not found' },
    ])
    const items = state.scenes[0].lanes[0].items
    expect(items[0].status).toBe('slow')
    expect(items[1].status).toBe('error')
    expect(items[1].error).toBe('not found')
  })

  it('attributes a stamped action even to an actor not declared at scene:start', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 's', file: 'f', actors: [], teamIndex: 0, team: {} },
      { type: 'action:start', timestamp: 3, runId: '1', actor: 'late', action: 'openTo', target: '/', scene: 's', teamIndex: 0 },
    ])
    expect(state.scenes[0].lanes.find((l) => l.actor === 'late')).toBeTruthy()
  })

  it('counts a failed scene toward failCount', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 's', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
      { type: 'scene:end', timestamp: 3, runId: '1', name: 's', status: 'failed', duration: 5, error: 'boom', teamIndex: 0, team: {} },
    ])
    expect(state.failCount).toBe(1)
    expect(state.passCount).toBe(0)
    expect(state.scenes[0].error).toBe('boom')
  })

  it('shows only the latest run (the multi-run store is sliced where runId = latest)', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 'old', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
      { type: 'scene:end', timestamp: 3, runId: '1', name: 'old', status: 'completed', duration: 1, teamIndex: 0, team: {} },
      { type: 'run:start', timestamp: 10, runId: '10', sceneCount: 1 },
      { type: 'scene:start', timestamp: 11, runId: '10', name: 'new', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
    ])
    expect(state.scenes.map((s) => s.name)).toEqual(['new'])
    expect(state.running).toBe(true)
  })

  it('pulls final counts from the run:end summary and stops running', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 3 },
      { type: 'run:end', timestamp: 9, runId: '1', duration: 1234, summary: { scenes: 3, completed: 2, failed: 1, assertions: { total: 5, passed: 4, failed: 1 }, warnings: 0, consoleErrors: 0 } },
    ])
    expect(state.running).toBe(false)
    expect(state.endDurationMs).toBe(1234)
    expect(state.passCount).toBe(2)
    expect(state.failCount).toBe(1)
  })

  it('completedSceneCount counts only finished scenes', () => {
    const state = project([
      { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 2 },
      { type: 'scene:start', timestamp: 2, runId: '1', name: 'a', file: 'f', actors: [], teamIndex: 0, team: {} },
      { type: 'scene:end', timestamp: 3, runId: '1', name: 'a', status: 'completed', duration: 1, teamIndex: 0, team: {} },
      { type: 'scene:start', timestamp: 4, runId: '1', name: 'b', file: 'f', actors: [], teamIndex: 0, team: {} },
    ])
    expect(completedSceneCount(state)).toBe(1)
  })
})
