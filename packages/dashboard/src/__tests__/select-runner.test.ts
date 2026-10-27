import { describe, it, expect } from 'vitest'
import type { SceneRow, AssertionRecord, ActionRecord, RunRow } from '../collections/projections.js'
import { latestRunSlice } from '../select-helpers.js'
import { selectSnapshot, mapReportToSnapshot } from '../select-runner.js'

/**
 * The Runner selector now carries the two things absorbed from the retired
 * Waterfall: per-actor lanes (the concurrent-actor timeline) and the live run
 * state (running/paused/cancelled + timing) the header controls read.
 */

const team = { name: 't', index: 0 }
const RUN = 'r1'

function scene(name: string, status: string, actors: string[], start: number): SceneRow {
  return {
    id: `${RUN}:0:${name}`,
    runId: RUN,
    name,
    file: 'a.spec.ts',
    actors,
    status,
    startTime: start,
    endTime: status === 'running' ? null : start + 10,
    duration: status === 'running' ? null : 10,
    error: status === 'failed' ? 'boom' : null,
    team,
    teamIndex: 0,
  }
}

function action(sceneName: string, actor: string, name: string, start: number, opts: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: `${RUN}:${name}:${actor}`,
    runId: RUN,
    actor,
    action: name,
    target: 'x',
    startTime: start,
    endTime: start + 5,
    duration: 5,
    error: null,
    status: 'success',
    sceneId: `${RUN}:0:${sceneName}`,
    timestamp: start,
    ...opts,
  }
}

function runRow(over: Partial<RunRow> = {}): RunRow {
  return {
    id: RUN,
    startTime: 100,
    endTime: null,
    duration: null,
    status: 'running',
    paused: false,
    cancelled: false,
    sceneCount: 1,
    completed: 0,
    failed: 0,
    ...over,
  }
}

function snap(scenes: SceneRow[], actions: ActionRecord[], assertions: AssertionRecord[], runs: RunRow[]) {
  return selectSnapshot(latestRunSlice(scenes, assertions, actions, runs))
}

describe('selectSnapshot: actor lanes', () => {
  it('groups a scene\'s actions into per-actor lanes, seeded by the actor list', () => {
    const s = scene('login', 'completed', ['alice', 'bob'], 10)
    const actions = [
      action('login', 'alice', 'typeInto', 11),
      action('login', 'alice', 'click', 13),
      action('login', 'bob', 'wait', 12, { duration: 900 }),
    ]
    const out = snap([s], actions, [], [runRow({ sceneCount: 1 })])
    const lanes = out.scenes[0].lanes
    expect(lanes.map((l) => l.actor)).toEqual(['alice', 'bob'])
    expect(lanes[0].items.map((i) => i.action)).toEqual(['typeInto', 'click'])
    expect(lanes[1].items[0]).toMatchObject({ action: 'wait', status: 'slow' })
  })

  it('flags running and errored actions in the lane', () => {
    const s = scene('x', 'running', ['a'], 10)
    const actions = [
      action('x', 'a', 'running-act', 11, { status: 'running', endTime: null, duration: null }),
      action('x', 'a', 'bad-act', 12, { status: 'error', error: 'nope' }),
    ]
    const items = snap([s], actions, [], [runRow()]).scenes[0].lanes[0].items
    expect(items.find((i) => i.action === 'running-act')?.status).toBe('running')
    expect(items.find((i) => i.action === 'bad-act')?.status).toBe('error')
  })
})

describe('selectSnapshot: run state (for header controls)', () => {
  it('reports a running, unpaused run', () => {
    const out = snap([scene('a', 'running', ['a'], 10)], [], [], [runRow({ status: 'running' })])
    expect(out.run).toMatchObject({ running: true, paused: false, cancelled: false, startTime: 100 })
  })

  it('reflects pause and stop from the run row', () => {
    const paused = snap([scene('a', 'running', ['a'], 10)], [], [], [runRow({ paused: true })])
    expect(paused.run.paused).toBe(true)

    const stopped = snap(
      [scene('a', 'failed', ['a'], 10)],
      [],
      [],
      [runRow({ status: 'finished', cancelled: true, duration: 42, endTime: 142 })]
    )
    expect(stopped.run).toMatchObject({ running: false, cancelled: true, endDurationMs: 42 })
  })
})

describe('mapReportToSnapshot (past runs)', () => {
  it('builds lanes from the flat timeline and marks the run finished', () => {
    const report = {
      startTime: 5,
      summary: { scenes: 1, completed: 1, failed: 0, duration: 88, assertions: { total: 0, passed: 0, failed: 0 } },
      scenes: [
        {
          name: 'past',
          file: 'a.spec.ts',
          status: 'completed',
          duration: 20,
          actors: ['a', 'b'],
          timeline: [
            { actor: 'a', action: 'click', target: 'save', duration: 5 },
            { actor: 'b', action: 'wait', duration: 700 },
          ],
        },
      ],
    }
    const out = mapReportToSnapshot(report)
    expect(out.run).toMatchObject({ running: false, endDurationMs: 88 })
    const lanes = out.scenes[0].lanes
    expect(lanes.map((l) => l.actor)).toEqual(['a', 'b'])
    expect(lanes[1].items[0]).toMatchObject({ action: 'wait', status: 'slow' })
  })
})
