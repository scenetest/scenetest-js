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

export type FilterMode = 'all' | 'fails' | 'passes'

declare global {
  interface Window {
    __scenetest_panel?: boolean
    __scenetest_report?: (result: AssertionResult) => void
    __scenetest_openInEditor?: (loc: AssertionResult['location']) => void
    __scenetest_openFullscreenToGroup?: (groupId: number) => void
  }
}
