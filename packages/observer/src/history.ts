/**
 * Assertion history tracking
 */

import type { AssertionResult, HistoryEntry, HistoryStats } from './types.js'
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
