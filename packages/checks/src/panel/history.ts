/**
 * Assertion history tracking
 */

import type { AssertionResult, HistoryEntry, HistoryStats, FlakyStats, ResolutionStats, ResolutionInfo } from './types.js'
import { assertionHistory } from './state.js'

/**
 * Track an assertion in the history map
 */
export function trackAssertion(result: AssertionResult, index: number): HistoryEntry[] {
  const key = result.description
  if (!assertionHistory.has(key)) {
    assertionHistory.set(key, [])
  }
  const history = assertionHistory.get(key)!
  history.push({ result: result.result, timestamp: result.timestamp, index })
  return history
}

/**
 * Get history stats for an assertion at a given index
 */
export function getHistoryStats(description: string, currentIndex: number): HistoryStats | null {
  const history = assertionHistory.get(description)
  if (!history || history.length <= 1) return null

  let priorPassed = 0
  let priorFailed = 0
  let afterPassed = 0
  let afterFailed = 0

  for (const entry of history) {
    if (entry.index < currentIndex) {
      if (entry.result) priorPassed++
      else priorFailed++
    } else if (entry.index > currentIndex) {
      if (entry.result) afterPassed++
      else afterFailed++
    }
  }

  const total = history.length - 1 // exclude current
  if (total === 0) return null

  return { priorPassed, priorFailed, afterPassed, afterFailed, total }
}

/**
 * Format history stats for display
 */
export function formatHistorySummary(stats: HistoryStats | null): string {
  if (!stats) return ''

  const parts: string[] = []
  const priorTotal = stats.priorPassed + stats.priorFailed
  const afterTotal = stats.afterPassed + stats.afterFailed

  if (priorTotal > 0) {
    if (stats.priorFailed === 0) {
      parts.push(`${priorTotal} prior \u2713`)
    } else if (stats.priorPassed === 0) {
      parts.push(`${priorTotal} prior \u2717`)
    } else {
      parts.push(`${priorTotal} prior (${stats.priorPassed}\u2713 ${stats.priorFailed}\u2717)`)
    }
  }

  if (afterTotal > 0) {
    if (stats.afterFailed === 0) {
      parts.push(`${afterTotal} after \u2713`)
    } else if (stats.afterPassed === 0) {
      parts.push(`${afterTotal} after \u2717`)
    } else {
      parts.push(`${afterTotal} after (${stats.afterPassed}\u2713 ${stats.afterFailed}\u2717)`)
    }
  }

  return parts.length > 0 ? `(${parts.join(', ')})` : ''
}

/**
 * Compute flaky statistics for an assertion
 */
export function computeFlakyStats(description: string): FlakyStats | null {
  const history = assertionHistory.get(description)
  if (!history || history.length === 0) return null

  const passCount = history.filter(e => e.result).length
  const failCount = history.filter(e => !e.result).length
  const totalRuns = history.length
  const failureRate = totalRuns > 0 ? (failCount / totalRuns) * 100 : 0
  const isFlaky = passCount > 0 && failCount > 0
  const isCurrentlyFailing = history.length > 0 && !history[history.length - 1].result

  return {
    totalRuns,
    passCount,
    failCount,
    failureRate,
    isFlaky,
    isCurrentlyFailing,
  }
}

/**
 * Compute resolution statistics for failures
 * Tracks when failures are "resolved" by a subsequent pass
 * Consecutive failures before a pass count as "repeats" - only the last one is "resolved"
 */
export function computeResolutionStats(description: string): ResolutionStats | null {
  const history = assertionHistory.get(description)
  if (!history || history.length === 0) return null

  const resolvedFailures: ResolutionInfo[] = []
  let repeatFailures = 0
  let unresolvedFailures = 0

  // Sort by index to ensure chronological order
  const sorted = [...history].sort((a, b) => a.index - b.index)

  let i = 0
  while (i < sorted.length) {
    const entry = sorted[i]
    if (!entry.result) {
      // Start of a failure sequence - find all consecutive failures
      let consecutiveFailCount = 1
      let lastFailIndex = i
      let lastFailEntry = entry

      // Count consecutive failures
      for (let j = i + 1; j < sorted.length; j++) {
        if (!sorted[j].result) {
          consecutiveFailCount++
          lastFailIndex = j
          lastFailEntry = sorted[j]
        } else {
          break
        }
      }

      // Look for a pass after the failure sequence
      let resolved = false
      for (let j = lastFailIndex + 1; j < sorted.length; j++) {
        if (sorted[j].result) {
          // Found a pass that resolves the failure sequence
          // Only count the LAST failure as resolved, others are repeats
          const duration = sorted[j].timestamp - lastFailEntry.timestamp
          resolvedFailures.push({
            duration,
            failTimestamp: lastFailEntry.timestamp,
            passTimestamp: sorted[j].timestamp,
          })
          repeatFailures += consecutiveFailCount - 1
          resolved = true
          break
        }
      }

      if (!resolved) {
        // All failures in this sequence are unresolved
        unresolvedFailures += consecutiveFailCount
      }

      // Skip past the consecutive failures we just processed
      i = lastFailIndex + 1
    } else {
      i++
    }
  }

  if (resolvedFailures.length === 0 && unresolvedFailures === 0) {
    return null
  }

  // Calculate min/max and detect outliers
  let minDuration: number | null = null
  let maxDuration: number | null = null
  const outliers: ResolutionInfo[] = []
  const normalRange: ResolutionInfo[] = []

  if (resolvedFailures.length > 0) {
    const durations = resolvedFailures.map(r => r.duration).sort((a, b) => a - b)
    minDuration = durations[0]
    maxDuration = durations[durations.length - 1]

    // Detect outliers using IQR method if we have enough data points
    if (durations.length >= 4) {
      const q1Index = Math.floor(durations.length * 0.25)
      const q3Index = Math.floor(durations.length * 0.75)
      const q1 = durations[q1Index]
      const q3 = durations[q3Index]
      const iqr = q3 - q1
      const outlierThreshold = q3 + 1.5 * iqr

      for (const res of resolvedFailures) {
        if (res.duration > outlierThreshold) {
          outliers.push(res)
        } else {
          normalRange.push(res)
        }
      }

      return {
        resolvedFailures,
        repeatFailures,
        unresolvedFailures,
        minDuration: normalRange.length > 0 ? Math.min(...normalRange.map(r => r.duration)) : minDuration,
        maxDuration: normalRange.length > 0 ? Math.max(...normalRange.map(r => r.duration)) : maxDuration,
        outlierThreshold: outliers.length > 0 ? outlierThreshold : null,
        outliers,
        normalRange,
      }
    } else {
      // Not enough data for outlier detection
      return {
        resolvedFailures,
        repeatFailures,
        unresolvedFailures,
        minDuration,
        maxDuration,
        outlierThreshold: null,
        outliers: [],
        normalRange: resolvedFailures,
      }
    }
  }

  return {
    resolvedFailures,
    repeatFailures,
    unresolvedFailures,
    minDuration,
    maxDuration,
    outlierThreshold: null,
    outliers: [],
    normalRange: [],
  }
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  } else {
    return `${(ms / 60000).toFixed(1)}m`
  }
}

/**
 * Format resolution summary with repeat and outlier information
 * Examples:
 * - "1 resolved in 5ms"
 * - "2 repeat + 1 resolved in 1.8s"
 * - "3 resolved in 3-9ms"
 * - "2 repeat + 2 resolved in 3-9ms, one outlier 140ms"
 */
export function formatResolutionSummary(stats: ResolutionStats | null): string {
  if (!stats) return ''

  const { resolvedFailures, repeatFailures, outliers, minDuration, maxDuration } = stats
  const resolvedCount = resolvedFailures.length

  if (resolvedCount === 0) return ''

  const parts: string[] = []

  // Add repeat count if any
  if (repeatFailures > 0) {
    parts.push(`${repeatFailures} repeat`)
  }

  // Add resolved count with duration
  if (resolvedCount === 1) {
    parts.push(`${resolvedCount} resolved in ${formatDuration(resolvedFailures[0].duration)}`)
  } else {
    // Use normal range for min/max if we have outliers
    const rangeMin = stats.normalRange.length > 0
      ? Math.min(...stats.normalRange.map(r => r.duration))
      : minDuration!
    const rangeMax = stats.normalRange.length > 0
      ? Math.max(...stats.normalRange.map(r => r.duration))
      : maxDuration!

    if (rangeMin === rangeMax) {
      parts.push(`${resolvedCount} resolved in ${formatDuration(rangeMin)}`)
    } else {
      parts.push(`${resolvedCount} resolved in ${formatDuration(rangeMin)}-${formatDuration(rangeMax)}`)
    }
  }

  let result = parts.join(' + ')

  // Add outlier info
  if (outliers.length === 1) {
    result += `, one outlier ${formatDuration(outliers[0].duration)}`
  } else if (outliers.length > 1) {
    const outlierDurations = outliers.map(o => formatDuration(o.duration)).join(', ')
    result += `, ${outliers.length} outliers (${outlierDurations})`
  }

  return result
}

/**
 * Format flaky status line for currently failing assertions
 * Example: "failing: 14 runs @ 21% failure, 6 of 248"
 */
export function formatFlakyStatus(stats: FlakyStats | null): string {
  if (!stats) return ''

  if (!stats.isFlaky && !stats.isCurrentlyFailing) return ''

  if (stats.isCurrentlyFailing) {
    const percent = Math.round(stats.failureRate)
    return `failing: ${stats.totalRuns} runs @ ${percent}% failure rate (${stats.failCount} of ${stats.totalRuns})`
  }

  // Flaky but currently passing - show resolution info instead
  return ''
}
