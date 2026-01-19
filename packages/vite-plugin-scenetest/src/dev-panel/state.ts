/**
 * Shared state for the dev panel
 */

import type { AssertionResult, AssertionGroup, FilterMode, HistoryEntry } from './types'

// Assertion storage
export const assertions: AssertionResult[] = []
export const groups: AssertionGroup[] = []
export const assertionHistory = new Map<string, HistoryEntry[]>()

// Counts
export let passCount = 0
export let failCount = 0

export function incrementPassCount(): void {
  passCount++
}

export function incrementFailCount(): void {
  failCount++
}

// UI state
export let panel: HTMLDivElement | null = null
export let listEl: HTMLElement | null = null
export let fullscreenWindow: Window | null = null
export let filter: FilterMode = 'all'
export let groupingEnabled = true
export let collapsedMode = true // Always start collapsed

export function setPanel(el: HTMLDivElement): void {
  panel = el
}

export function setListEl(el: HTMLElement): void {
  listEl = el
}

export function setFullscreenWindow(win: Window | null): void {
  fullscreenWindow = win
}

export function setFilter(newFilter: FilterMode): void {
  filter = newFilter
}

export function toggleGrouping(): boolean {
  groupingEnabled = !groupingEnabled
  return groupingEnabled
}

export function toggleCollapsedMode(): boolean {
  collapsedMode = !collapsedMode
  return collapsedMode
}

export function collapseAllGroups(): void {
  for (const g of groups) {
    g.collapsed = true
  }
}

export function expandAllGroups(): void {
  for (const g of groups) {
    g.collapsed = false
  }
}

// Grouping state
export const GROUP_THRESHOLD_MS = 50
export let pendingGroup: AssertionGroup | null = null
export let groupTimeout: ReturnType<typeof setTimeout> | null = null

export function setPendingGroup(group: AssertionGroup | null): void {
  pendingGroup = group
}

export function setGroupTimeout(timeout: ReturnType<typeof setTimeout> | null): void {
  groupTimeout = timeout
}

// Clear all state
export function clearAll(): void {
  assertions.length = 0
  groups.length = 0
  assertionHistory.clear()
  passCount = 0
  failCount = 0
  pendingGroup = null
  if (groupTimeout) {
    clearTimeout(groupTimeout)
    groupTimeout = null
  }
}
