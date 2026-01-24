/**
 * Tests for history tracking functions
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  trackAssertion,
  getHistoryStats,
  formatHistorySummary,
  computeFlakyStats,
  computeResolutionStats,
  formatResolutionSummary,
  formatFlakyStatus,
} from '../history.js'
import { assertionHistory } from '../state.js'
import type { AssertionResult } from '../types.js'

// Helper to create assertion results
function createAssertion(description: string, result: boolean, timestamp: number): AssertionResult {
  return {
    type: result ? 'pass' : 'fail',
    description,
    result,
    timestamp,
  }
}

describe('trackAssertion', () => {
  beforeEach(() => {
    assertionHistory.clear()
  })

  it('tracks a single assertion', () => {
    const assertion = createAssertion('test', true, 1000)
    const history = trackAssertion(assertion, 0)

    expect(history).toHaveLength(1)
    expect(history[0]).toEqual({ result: true, timestamp: 1000, index: 0 })
  })

  it('tracks multiple assertions with same description', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', false, 2000), 1)
    trackAssertion(createAssertion('test', true, 3000), 2)

    const history = assertionHistory.get('test')
    expect(history).toHaveLength(3)
    expect(history![0].result).toBe(true)
    expect(history![1].result).toBe(false)
    expect(history![2].result).toBe(true)
  })
})

describe('getHistoryStats', () => {
  beforeEach(() => {
    assertionHistory.clear()
  })

  it('returns null for single assertion', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)

    const stats = getHistoryStats('test', 0)
    expect(stats).toBeNull()
  })

  it('returns correct stats for multiple assertions', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', false, 2000), 1)
    trackAssertion(createAssertion('test', true, 3000), 2)
    trackAssertion(createAssertion('test', true, 4000), 3)

    const stats = getHistoryStats('test', 2)
    expect(stats).toEqual({
      priorPassed: 1,
      priorFailed: 1,
      afterPassed: 1,
      afterFailed: 0,
      total: 3,
    })
  })
})

describe('formatHistorySummary', () => {
  it('returns empty string for null', () => {
    expect(formatHistorySummary(null)).toBe('')
  })

  it('formats all passed prior', () => {
    const result = formatHistorySummary({
      priorPassed: 3, priorFailed: 0, afterPassed: 0, afterFailed: 0, total: 3
    })
    expect(result).toBe('(3 prior ✓)')
  })

  it('formats mixed prior', () => {
    const result = formatHistorySummary({
      priorPassed: 2, priorFailed: 1, afterPassed: 0, afterFailed: 0, total: 3
    })
    expect(result).toBe('(3 prior (2✓ 1✗))')
  })
})

describe('computeFlakyStats', () => {
  beforeEach(() => {
    assertionHistory.clear()
  })

  it('returns null for unknown description', () => {
    expect(computeFlakyStats('unknown')).toBeNull()
  })

  it('detects non-flaky passing test', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', true, 2000), 1)

    const stats = computeFlakyStats('test')
    expect(stats?.isFlaky).toBe(false)
    expect(stats?.isCurrentlyFailing).toBe(false)
    expect(stats?.failureRate).toBe(0)
  })

  it('detects flaky test', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', false, 2000), 1)
    trackAssertion(createAssertion('test', true, 3000), 2)

    const stats = computeFlakyStats('test')
    expect(stats?.isFlaky).toBe(true)
    expect(stats?.isCurrentlyFailing).toBe(false)
    expect(stats?.totalRuns).toBe(3)
    expect(stats?.passCount).toBe(2)
    expect(stats?.failCount).toBe(1)
    expect(stats?.failureRate).toBeCloseTo(33.33, 1)
  })

  it('detects currently failing', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', false, 2000), 1)

    const stats = computeFlakyStats('test')
    expect(stats?.isCurrentlyFailing).toBe(true)
    expect(stats?.isFlaky).toBe(true)
  })
})

describe('computeResolutionStats', () => {
  beforeEach(() => {
    assertionHistory.clear()
  })

  it('returns null for unknown description', () => {
    expect(computeResolutionStats('unknown')).toBeNull()
  })

  it('returns null for all passing', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', true, 2000), 1)

    expect(computeResolutionStats('test')).toBeNull()
  })

  it('calculates single resolved failure', () => {
    trackAssertion(createAssertion('test', false, 1000), 0)
    trackAssertion(createAssertion('test', true, 1050), 1)

    const stats = computeResolutionStats('test')
    expect(stats?.resolvedFailures).toHaveLength(1)
    expect(stats?.resolvedFailures[0].duration).toBe(50)
    expect(stats?.unresolvedFailures).toBe(0)
  })

  it('tracks unresolved failure', () => {
    trackAssertion(createAssertion('test', true, 1000), 0)
    trackAssertion(createAssertion('test', false, 2000), 1)

    const stats = computeResolutionStats('test')
    expect(stats?.resolvedFailures).toHaveLength(0)
    expect(stats?.unresolvedFailures).toBe(1)
  })

  it('calculates multiple resolved failures', () => {
    // fail -> pass (50ms), fail -> pass (100ms), fail -> pass (80ms)
    trackAssertion(createAssertion('test', false, 1000), 0)
    trackAssertion(createAssertion('test', true, 1050), 1)
    trackAssertion(createAssertion('test', false, 2000), 2)
    trackAssertion(createAssertion('test', true, 2100), 3)
    trackAssertion(createAssertion('test', false, 3000), 4)
    trackAssertion(createAssertion('test', true, 3080), 5)

    const stats = computeResolutionStats('test')
    expect(stats?.resolvedFailures).toHaveLength(3)
    expect(stats?.minDuration).toBe(50)
    expect(stats?.maxDuration).toBe(100)
  })

  it('detects outliers', () => {
    // Normal range 5-10ms, outlier at 500ms
    trackAssertion(createAssertion('test', false, 1000), 0)
    trackAssertion(createAssertion('test', true, 1005), 1)
    trackAssertion(createAssertion('test', false, 2000), 2)
    trackAssertion(createAssertion('test', true, 2008), 3)
    trackAssertion(createAssertion('test', false, 3000), 4)
    trackAssertion(createAssertion('test', true, 3010), 5)
    trackAssertion(createAssertion('test', false, 4000), 6)
    trackAssertion(createAssertion('test', true, 4007), 7)
    trackAssertion(createAssertion('test', false, 5000), 8)
    trackAssertion(createAssertion('test', true, 5500), 9) // Outlier: 500ms

    const stats = computeResolutionStats('test')
    expect(stats?.outliers).toHaveLength(1)
    expect(stats?.outliers[0].duration).toBe(500)
    expect(stats?.normalRange).toHaveLength(4)
  })
})

describe('formatResolutionSummary', () => {
  it('returns empty string for null', () => {
    expect(formatResolutionSummary(null)).toBe('')
  })

  it('formats single failure', () => {
    const result = formatResolutionSummary({
      resolvedFailures: [{ duration: 5, failTimestamp: 0, passTimestamp: 5 }],
      unresolvedFailures: 0,
      minDuration: 5,
      maxDuration: 5,
      outlierThreshold: null,
      outliers: [],
      normalRange: [{ duration: 5, failTimestamp: 0, passTimestamp: 5 }],
    })
    expect(result).toBe('1 failure resolved in 5ms')
  })

  it('formats multiple failures with range', () => {
    const result = formatResolutionSummary({
      resolvedFailures: [
        { duration: 3, failTimestamp: 0, passTimestamp: 3 },
        { duration: 9, failTimestamp: 100, passTimestamp: 109 },
      ],
      unresolvedFailures: 0,
      minDuration: 3,
      maxDuration: 9,
      outlierThreshold: null,
      outliers: [],
      normalRange: [
        { duration: 3, failTimestamp: 0, passTimestamp: 3 },
        { duration: 9, failTimestamp: 100, passTimestamp: 109 },
      ],
    })
    expect(result).toBe('2 failures, resolved in 3ms-9ms')
  })

  it('formats with one outlier', () => {
    const result = formatResolutionSummary({
      resolvedFailures: [
        { duration: 3, failTimestamp: 0, passTimestamp: 3 },
        { duration: 9, failTimestamp: 100, passTimestamp: 109 },
        { duration: 140, failTimestamp: 200, passTimestamp: 340 },
      ],
      unresolvedFailures: 0,
      minDuration: 3,
      maxDuration: 9,
      outlierThreshold: 50,
      outliers: [{ duration: 140, failTimestamp: 200, passTimestamp: 340 }],
      normalRange: [
        { duration: 3, failTimestamp: 0, passTimestamp: 3 },
        { duration: 9, failTimestamp: 100, passTimestamp: 109 },
      ],
    })
    expect(result).toBe('3 failures, resolved in 3ms-9ms with one outlier 140ms')
  })
})

describe('formatFlakyStatus', () => {
  it('returns empty string for null', () => {
    expect(formatFlakyStatus(null)).toBe('')
  })

  it('returns empty string for non-flaky passing test', () => {
    expect(formatFlakyStatus({
      totalRuns: 10,
      passCount: 10,
      failCount: 0,
      failureRate: 0,
      isFlaky: false,
      isCurrentlyFailing: false,
    })).toBe('')
  })

  it('formats currently failing flaky test', () => {
    const result = formatFlakyStatus({
      totalRuns: 14,
      passCount: 11,
      failCount: 3,
      failureRate: 21.43,
      isFlaky: true,
      isCurrentlyFailing: true,
    })
    expect(result).toBe('failing: 14 runs @ 21% failure rate (3 of 14)')
  })
})
