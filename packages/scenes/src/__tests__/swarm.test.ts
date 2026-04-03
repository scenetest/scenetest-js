import { describe, it, expect } from 'vitest'
import { SwarmTrigger, resolveSwarmConfig } from '../swarm.js'
import type { RunReport, SceneReport, SwarmConfig } from '../types.js'

// ── Helpers ──────────────────────────────────────────────────────────

function makeSceneReport(
  name: string,
  status: 'completed' | 'failed' = 'completed',
  assertions: Array<{ result: boolean }> = [{ result: true }]
): SceneReport {
  return {
    name,
    file: `scenes/${name}.spec.ts`,
    status,
    teamIndex: 0,
    team: {},
    actors: {},
    assertions: assertions.map((a) => ({
      type: a.result ? 'pass' as const : 'fail' as const,
      description: 'test',
      result: a.result,
      timestamp: Date.now(),
    })),
    warnings: [],
    consoleErrors: [],
    timeline: [],
    duration: 100,
  }
}

function makeRunReport(scenes: SceneReport[]): RunReport {
  return {
    timestamp: new Date().toISOString(),
    duration: 1000,
    scenes,
    summary: {
      scenes: scenes.length,
      completed: scenes.filter((s) => s.status === 'completed').length,
      failed: scenes.filter((s) => s.status !== 'completed').length,
      assertions: {
        total: scenes.reduce((sum, s) => sum + s.assertions.length, 0),
        passed: scenes.reduce((sum, s) => sum + s.assertions.filter((a) => a.result).length, 0),
        failed: scenes.reduce((sum, s) => sum + s.assertions.filter((a) => !a.result).length, 0),
      },
      warnings: 0,
      consoleErrors: 0,
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('resolveSwarmConfig', () => {
  it('provides defaults when no config given', () => {
    const resolved = resolveSwarmConfig()
    expect(resolved.failureThreshold).toBe(5)
    expect(resolved.windowSize).toBe(3)
    expect(resolved.concurrency).toBe(Infinity)
    expect(resolved.repeats).toBe(3)
    expect(resolved.auto).toBe(true)
  })

  it('merges partial config with defaults', () => {
    const resolved = resolveSwarmConfig({ failureThreshold: 10, concurrency: 2 })
    expect(resolved.failureThreshold).toBe(10)
    expect(resolved.concurrency).toBe(2)
    expect(resolved.windowSize).toBe(3) // default
    expect(resolved.repeats).toBe(3) // default
    expect(resolved.auto).toBe(true) // default
  })

  it('overrides all defaults when full config given', () => {
    const config: Required<SwarmConfig> = {
      failureThreshold: 2,
      windowSize: 5,
      concurrency: 4,
      repeats: 10,
      auto: false,
    }
    const resolved = resolveSwarmConfig(config)
    expect(resolved).toEqual(config)
  })
})

describe('SwarmTrigger', () => {
  describe('recordRun', () => {
    it('tracks scene outcomes across runs', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      // Run 1: scene passes
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      const record = trigger.getRecord('login')
      expect(record).toBeDefined()
      expect(record!.history).toEqual([true])
      expect(record!.consecutiveFailures).toBe(0)
    })

    it('counts consecutive failures', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      // Passes
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(0)

      // Fails
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(1)

      // Fails again
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(2)
    })

    it('resets consecutive count on pass', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 5, windowSize: 5 })

      // Two failures
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(2)

      // Pass breaks the streak
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(0)
    })

    it('treats completed scenes with failed assertions as failures', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      // Scene completes but has a failed assertion
      const scene = makeSceneReport('login', 'completed', [{ result: false }])
      trigger.recordRun(makeRunReport([scene]))
      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(1)
    })

    it('trims history to window size', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 5, windowSize: 3 })

      // Record 5 runs
      for (let i = 0; i < 5; i++) {
        trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      }

      // History should be trimmed to 3
      expect(trigger.getRecord('login')!.history).toHaveLength(3)
    })

    it('tracks multiple scenes independently', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      trigger.recordRun(makeRunReport([
        makeSceneReport('login'),
        makeSceneReport('profile', 'failed'),
      ]))

      expect(trigger.getRecord('login')!.consecutiveFailures).toBe(0)
      expect(trigger.getRecord('profile')!.consecutiveFailures).toBe(1)
    })
  })

  describe('shouldTrigger', () => {
    it('does not trigger when failures are below threshold', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))

      expect(trigger.shouldTrigger()).toEqual([])
    })

    it('triggers when consecutive failures reach threshold', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 5 })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))

      expect(trigger.shouldTrigger()).toEqual(['login'])
    })

    it('returns multiple triggered scenes', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 2, windowSize: 5 })

      trigger.recordRun(makeRunReport([
        makeSceneReport('login', 'failed'),
        makeSceneReport('profile', 'failed'),
      ]))
      trigger.recordRun(makeRunReport([
        makeSceneReport('login', 'failed'),
        makeSceneReport('profile', 'failed'),
      ]))

      const triggered = trigger.shouldTrigger()
      expect(triggered).toContain('login')
      expect(triggered).toContain('profile')
      expect(triggered).toHaveLength(2)
    })

    it('does not trigger when auto is disabled', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 1, auto: false })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))

      expect(trigger.shouldTrigger()).toEqual([])
    })

    it('only triggers for scenes that exceed threshold, not all', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 2, windowSize: 5 })

      // login fails twice, profile fails once
      trigger.recordRun(makeRunReport([
        makeSceneReport('login', 'failed'),
        makeSceneReport('profile', 'failed'),
      ]))
      trigger.recordRun(makeRunReport([
        makeSceneReport('login', 'failed'),
        makeSceneReport('profile'), // passes this time
      ]))

      expect(trigger.shouldTrigger()).toEqual(['login'])
    })
  })

  describe('clear', () => {
    it('resets all tracking data', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 1 })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.shouldTrigger()).toEqual(['login'])

      trigger.clear()
      expect(trigger.shouldTrigger()).toEqual([])
      expect(trigger.getRecord('login')).toBeUndefined()
    })
  })

  describe('threshold edge cases', () => {
    it('threshold of 1 triggers on first failure', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 1, windowSize: 3 })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.shouldTrigger()).toEqual(['login'])
    })

    it('a pass after threshold no longer triggers', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 2, windowSize: 5 })

      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      expect(trigger.shouldTrigger()).toEqual(['login'])

      // Now it passes
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      expect(trigger.shouldTrigger()).toEqual([])
    })

    it('interleaved pass/fail does not trigger', () => {
      const trigger = new SwarmTrigger({ failureThreshold: 3, windowSize: 10 })

      // fail, pass, fail, pass, fail — never 3 consecutive
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login')]))
      trigger.recordRun(makeRunReport([makeSceneReport('login', 'failed')]))

      expect(trigger.shouldTrigger()).toEqual([])
    })
  })
})
