/**
 * Types for the dev panel (browser-side)
 */

export interface AssertionResult {
  type: 'pass' | 'fail'
  description: string
  result: boolean
  timestamp: number
  stack?: string
  context?: Record<string, unknown>
  location?: {
    file: string
    line: number
    column?: number
  }
  _index?: number
}

export interface AssertionGroup {
  id: number
  timestamp: number
  items: AssertionResult[]
  collapsed: boolean
}

export interface HistoryEntry {
  result: boolean
  timestamp: number
  index: number
}

export interface HistoryStats {
  priorPassed: number
  priorFailed: number
  afterPassed: number
  afterFailed: number
  total: number
}

/**
 * Flaky test statistics for a specific assertion
 */
export interface FlakyStats {
  totalRuns: number
  passCount: number
  failCount: number
  failureRate: number // 0-100 percentage
  isFlaky: boolean // has both passes and fails
  isCurrentlyFailing: boolean
}

/**
 * Resolution statistics for failures that were later resolved
 */
export interface ResolutionInfo {
  duration: number // ms between failure and resolution
  failTimestamp: number
  passTimestamp: number
}

export interface ResolutionStats {
  resolvedFailures: ResolutionInfo[]
  unresolvedFailures: number
  minDuration: number | null
  maxDuration: number | null
  outlierThreshold: number | null // durations above this are outliers
  outliers: ResolutionInfo[]
  normalRange: ResolutionInfo[]
}

export type FilterMode = 'all' | 'fails' | 'passes'

export type ViewMode = 'grouped' | 'byLocation' | 'sequence'

/**
 * Represents a unique assertion location in the code
 * Used for the "by location" view
 */
export interface LocationGroup {
  key: string // "file:line" as unique key
  location: AssertionResult['location']
  description: string // Most recent description
  entries: LocationEntry[]
  lastResult: boolean
  lastTimestamp: number
}

/**
 * A single run of an assertion at a specific location
 */
export interface LocationEntry {
  result: boolean
  timestamp: number
  index: number
  description: string
  context?: Record<string, unknown>
}

declare global {
  interface Window {
    __scenetest_panel?: boolean
    // Note: __scenetest_report is declared in scenetest/types.ts
    // We extend it here with dev-panel specific functions
    __scenetest_openInEditor?: (loc: AssertionResult['location']) => void
    __scenetest_openFullscreenToGroup?: (groupId: number) => void
    __scenetest_showSequence?: (locationKey: string) => void
    __scenetest_setViewMode?: (mode: ViewMode) => void
  }
}
