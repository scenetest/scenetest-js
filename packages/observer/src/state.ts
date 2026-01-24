/**
 * Shared state for the dev panel
 */

import type { AssertionResult, AssertionGroup, FilterMode, HistoryEntry, ViewMode, LocationGroup } from './types.js'

// Assertion storage
export const assertions: AssertionResult[] = []
export const groups: AssertionGroup[] = []
export const assertionHistory = new Map<string, HistoryEntry[]>()

// Location-based grouping (keyed by description)
export const locationGroups = new Map<string, LocationGroup>()

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

// View mode state (fullscreen only)
export let viewMode: ViewMode = 'grouped'
export let sequenceLocationKey: string | null = null // Which location to show in sequence view

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

export function setViewMode(mode: ViewMode): void {
  viewMode = mode
  if (mode !== 'sequence') {
    sequenceLocationKey = null
  }
}

export function setSequenceLocation(key: string | null): void {
  sequenceLocationKey = key
  if (key !== null) {
    viewMode = 'sequence'
  }
}

/**
 * Get the location key from an assertion result
 * Uses description as key so each unique assertion is grouped separately.
 * This works better than file:line in minified code where many calls
 * end up on the same line.
 */
export function getLocationKey(result: AssertionResult): string {
  return result.description
}

/**
 * Track an assertion in the location groups
 */
export function trackLocationGroup(result: AssertionResult, index: number): void {
  const key = getLocationKey(result)

  let group = locationGroups.get(key)
  if (!group) {
    group = {
      key,
      location: result.location,
      description: result.description,
      entries: [],
      lastResult: result.result,
      lastTimestamp: result.timestamp,
    }
    locationGroups.set(key, group)
  }

  // Update group with latest info (location might change if same description used in different places)
  if (result.location) {
    group.location = result.location
  }
  group.lastResult = result.result
  group.lastTimestamp = result.timestamp
  group.entries.push({
    result: result.result,
    timestamp: result.timestamp,
    index,
    description: result.description,
    context: result.context,
  })
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

export function toggleGroupCollapsed(groupId: number): void {
  const group = groups.find(g => g.id === groupId)
  if (group) {
    group.collapsed = !group.collapsed
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
  locationGroups.clear()
  passCount = 0
  failCount = 0
  pendingGroup = null
  sequenceLocationKey = null
  if (groupTimeout) {
    clearTimeout(groupTimeout)
    groupTimeout = null
  }
}
