import { describe, it, expect } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import { applyEvent, completedSceneCount, foldEvents, initialState, withConnection } from '../store.js'

function fold(events: RunEvent[]) {
  return foldEvents(events)
}

describe('dashboard store', () => {
  it('folds a full run into scenes, lanes, assertions, and counts', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 2 },
      {
        type: 'scene:start',
        timestamp: 2,
        name: 'login',
        file: 'login.scene.ts',
        actors: ['alice'],
        teamIndex: 0,
        team: { name: 'fr' },
      },
      { type: 'action:start', timestamp: 3, actor: 'alice', action: 'typeInto', target: 'password' },
      { type: 'action:end', timestamp: 4, actor: 'alice', action: 'typeInto', target: 'password', duration: 12 },
      { type: 'assertion', timestamp: 5, actor: 'alice', description: 'logged in', result: true },
      { type: 'scene:end', timestamp: 6, name: 'login', status: 'completed', duration: 40, teamIndex: 0, team: { name: 'fr' } },
    ])

    expect(state.running).toBe(true)
    expect(state.sceneCount).toBe(2)
    expect(state.passCount).toBe(1)
    expect(state.failCount).toBe(0)
    expect(state.currentSceneIndex).toBeNull()
    expect(state.teams).toEqual(['fr'])
    expect(state.scenes).toHaveLength(1)

    const scene = state.scenes[0]
    expect(scene.status).toBe('completed')
    expect(scene.duration).toBe(40)
    expect(scene.lanes).toHaveLength(1)
    expect(scene.lanes[0].actor).toBe('alice')
    expect(scene.lanes[0].items[0]).toMatchObject({ action: 'typeInto', target: 'password', status: 'success', duration: 12 })
    expect(scene.assertions[0]).toMatchObject({ description: 'logged in', result: true })
  })

  it('marks slow and errored actions by duration and error', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, name: 's', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
      { type: 'action:start', timestamp: 3, actor: 'a', action: 'wait' },
      { type: 'action:end', timestamp: 4, actor: 'a', action: 'wait', duration: 900 },
      { type: 'action:start', timestamp: 5, actor: 'a', action: 'click', target: 'submit' },
      { type: 'action:end', timestamp: 6, actor: 'a', action: 'click', target: 'submit', duration: 10, error: 'not found' },
    ])
    const items = state.scenes[0].lanes[0].items
    expect(items[0].status).toBe('slow')
    expect(items[1].status).toBe('error')
    expect(items[1].error).toBe('not found')
  })

  it('creates a lane on action:start for an actor not declared at scene:start', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, name: 's', file: 'f', actors: [], teamIndex: 0, team: {} },
      { type: 'action:start', timestamp: 3, actor: 'late', action: 'openTo', target: '/' },
    ])
    expect(state.scenes[0].actors).toContain('late')
    expect(state.scenes[0].lanes[0].actor).toBe('late')
  })

  it('counts a failed scene toward failCount', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, name: 's', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
      { type: 'scene:end', timestamp: 3, name: 's', status: 'failed', duration: 5, error: 'boom', teamIndex: 0, team: {} },
    ])
    expect(state.failCount).toBe(1)
    expect(state.passCount).toBe(0)
    expect(state.scenes[0].error).toBe('boom')
  })

  it('run:start resets prior run state but keeps connection', () => {
    let state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, name: 's', file: 'f', actors: ['a'], teamIndex: 0, team: {} },
    ])
    state = withConnection(state, 'connected')
    state = applyEvent(state, { type: 'run:start', timestamp: 10, sceneCount: 3 })
    expect(state.scenes).toHaveLength(0)
    expect(state.sceneCount).toBe(3)
    expect(state.connection).toBe('connected')
  })

  it('run:end pulls final counts from the summary and stops running', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 3 },
      {
        type: 'run:end',
        timestamp: 9,
        duration: 1234,
        summary: { scenes: 3, completed: 2, failed: 1, assertions: { total: 5, passed: 4, failed: 1 }, warnings: 0, consoleErrors: 0 },
      },
    ])
    expect(state.running).toBe(false)
    expect(state.endDurationMs).toBe(1234)
    expect(state.passCount).toBe(2)
    expect(state.failCount).toBe(1)
  })

  it('folds the run:progress rollup when present', () => {
    const state = applyEvent(initialState(), { type: 'run:progress', timestamp: 1, pct: 60, failing: 1, flaky: 2 })
    expect(state.progress).toEqual({ pct: 60, failing: 1, flaky: 2 })
  })

  it('ignores unknown future event types without throwing', () => {
    const before = initialState()
    const after = applyEvent(before, { type: 'hologram:flicker', timestamp: 1 } as unknown as RunEvent)
    expect(after).toBe(before)
  })

  it('does not mutate the previous state object (immutable updates)', () => {
    const a = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'scene:start', timestamp: 2, name: 's', file: 'f', actors: ['x'], teamIndex: 0, team: {} },
    ])
    const b = applyEvent(a, { type: 'action:start', timestamp: 3, actor: 'x', action: 'click', target: 'go' })
    expect(a.scenes[0].lanes[0].items).toHaveLength(0)
    expect(b.scenes[0].lanes[0].items).toHaveLength(1)
    expect(b.scenes).not.toBe(a.scenes)
  })

  it('completedSceneCount counts only finished scenes', () => {
    const state = fold([
      { type: 'run:start', timestamp: 1, sceneCount: 2 },
      { type: 'scene:start', timestamp: 2, name: 'a', file: 'f', actors: [], teamIndex: 0, team: {} },
      { type: 'scene:end', timestamp: 3, name: 'a', status: 'completed', duration: 1, teamIndex: 0, team: {} },
      { type: 'scene:start', timestamp: 4, name: 'b', file: 'f', actors: [], teamIndex: 0, team: {} },
    ])
    expect(completedSceneCount(state)).toBe(1)
  })
})
