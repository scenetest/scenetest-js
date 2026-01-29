/**
 * Scenecheck Observer
 * Real-time assertion panel for scenecheck
 */

// Version and git hash are injected by vite plugin onto window globals at runtime
// This allows the observer to be a regular module without pre-bundling
const VERSION = typeof window !== 'undefined' && (window as { __SCENECHECK_VERSION__?: string }).__SCENECHECK_VERSION__ || 'dev'
const GIT_HASH = typeof window !== 'undefined' && (window as { __SCENECHECK_GIT_HASH__?: string }).__SCENECHECK_GIT_HASH__ || 'local'

import type { AssertionResult, ViewMode } from './types.js'
import {
  assertions,
  groups,
  panel,
  GROUP_THRESHOLD_MS,
  pendingGroup,
  groupTimeout,
  collapsedMode,
  setPendingGroup,
  setGroupTimeout,
  incrementPassCount,
  incrementFailCount,
  trackLocationGroup,
  setViewMode,
} from './state.js'
import { trackAssertion } from './history.js'
import { openInEditor } from './utils.js'
import { createPanel, updatePanel } from './panel.js'
import { updateFullscreenWindow, openFullscreenToGroup, showSequence } from './fullscreen.js'
import {
  playGroupChord,
  playSymphony,
  stopSymphony,
  toggleMute,
  setVolume,
  initAudio,
} from './audio.js'

// Re-export types for consumers
export type { AssertionResult, AssertionGroup, ViewMode } from './types.js'

declare global {
  interface Window {
    __scenecheck_panel?: boolean
    // __scenecheck_report is declared in ../types.ts
    __scenecheck_openInEditor?: typeof openInEditor
    __scenecheck_openFullscreenToGroup?: typeof openFullscreenToGroup
    __scenecheck_showSequence?: typeof showSequence
    __scenecheck_setViewMode?: (mode: ViewMode) => void
    // Audio/symphony functions
    __scenecheck_toggleMute?: () => boolean
    __scenecheck_playSymphony?: () => void
    __scenecheck_stopSymphony?: () => void
    __scenecheck_setVolume?: (v: number) => void
    __scenecheck_initAudio?: () => void
    __scenecheck_symphonyProgress?: (current: number, total: number) => void
    __scenecheck_symphonyComplete?: () => void
  }
}

/**
 * Add an assertion to a group (batches assertions that arrive within GROUP_THRESHOLD_MS)
 */
function addToGroup(result: AssertionResult): void {
  const now = Date.now()

  if (pendingGroup && now - pendingGroup.timestamp < GROUP_THRESHOLD_MS) {
    // Add to existing group
    pendingGroup.items.push(result)
  } else {
    // Start a new group
    const newGroup = {
      id: groups.length,
      timestamp: now,
      items: [result],
      collapsed: collapsedMode, // Use collapsedMode to determine initial state
    }
    setPendingGroup(newGroup)
    groups.push(newGroup)
  }

  // Debounce the finalization
  if (groupTimeout) clearTimeout(groupTimeout)
  setGroupTimeout(
    setTimeout(() => {
      // Play the chord for this group when finalized
      if (pendingGroup) {
        playGroupChord(pendingGroup.items)
      }
      setPendingGroup(null)
      updatePanel()
      updateFullscreenWindow()
    }, GROUP_THRESHOLD_MS)
  )
}

/**
 * Handle an incoming assertion result
 */
function handleAssertion(result: AssertionResult, existingReport?: (result: AssertionResult) => void): void {
  // Forward to existing reporter first (e.g., Playwright test collector)
  if (existingReport) {
    try {
      existingReport(result)
    } catch {
      // Ignore errors from existing reporter
    }
  }

  const index = assertions.length
  result._index = index // Store index for history lookup
  assertions.push(result)
  trackAssertion(result, index)
  trackLocationGroup(result, index)

  if (result.result) {
    incrementPassCount()
  } else {
    incrementFailCount()
  }

  // Add to group
  addToGroup(result)

  // Create panel on first assertion if not exists
  if (!panel && document.body) {
    createPanel()
  }

  updatePanel()
  updateFullscreenWindow()

  // Also log to console
  const icon = result.result ? '\u2713' : '\u2717'
  const style = result.result ? 'color: #4ade80' : 'color: #f87171'
  const serverTag = result.assertionId ? ' [server]' : ''
  console.log(`%c${icon} [scenecheck]${serverTag} ${result.description}`, style)
}

/**
 * Initialize the scenecheck observer panel.
 * Sets up window.__scenecheck_report and creates the floating panel UI.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export function initObserver(): void {
  // Don't initialize twice
  if (typeof window !== 'undefined' && window.__scenecheck_panel) {
    return
  }

  if (typeof window === 'undefined') {
    console.warn('[scenecheck/observer] initObserver() called in non-browser environment')
    return
  }

  window.__scenecheck_panel = true

  // Log version info
  console.log(
    `%c🎬 scenecheck dev panel v${VERSION} (${GIT_HASH})`,
    'color: #a78bfa; font-weight: bold'
  )

  // Make functions available globally for onclick handlers
  window.__scenecheck_openInEditor = openInEditor
  window.__scenecheck_openFullscreenToGroup = openFullscreenToGroup
  window.__scenecheck_showSequence = showSequence
  window.__scenecheck_setViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    updateFullscreenWindow()
  }

  // Audio/symphony functions
  window.__scenecheck_toggleMute = toggleMute
  window.__scenecheck_playSymphony = playSymphony
  window.__scenecheck_stopSymphony = stopSymphony
  window.__scenecheck_setVolume = setVolume
  window.__scenecheck_initAudio = initAudio

  // Set up the reporter - chain with existing function if present (e.g., Playwright's exposeFunction)
  const existingReport = window.__scenecheck_report

  window.__scenecheck_report = function (result: AssertionResult): void {
    handleAssertion(result, existingReport)
  }

  // Create panel when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel)
  } else {
    createPanel()
  }
}
