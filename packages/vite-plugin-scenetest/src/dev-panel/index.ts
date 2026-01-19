/**
 * Dev panel entry point
 * This file is bundled by esbuild into an IIFE that gets injected into the page
 */

import type { AssertionResult } from './types'
import {
  assertions,
  groups,
  panel,
  GROUP_THRESHOLD_MS,
  pendingGroup,
  groupTimeout,
  setPendingGroup,
  setGroupTimeout,
  incrementPassCount,
  incrementFailCount,
} from './state'
import { trackAssertion } from './history'
import { openInEditor } from './utils'
import { createPanel, updatePanel } from './panel'
import { updateFullscreenWindow } from './fullscreen'

// Don't inject twice
if (!window.__scenetest_panel) {
  window.__scenetest_panel = true

  // Make openInEditor available globally for onclick handlers
  window.__scenetest_openInEditor = openInEditor

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
        collapsed: false,
      }
      setPendingGroup(newGroup)
      groups.push(newGroup)
    }

    // Debounce the finalization
    if (groupTimeout) clearTimeout(groupTimeout)
    setGroupTimeout(
      setTimeout(() => {
        setPendingGroup(null)
        updatePanel()
        updateFullscreenWindow()
      }, GROUP_THRESHOLD_MS)
    )
  }

  // Set up the reporter - chain with existing function if present (e.g., Playwright's exposeFunction)
  const existingReport = window.__scenetest_report

  window.__scenetest_report = function (result: AssertionResult): void {
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
    console.log(`%c${icon} [scenetest] ${result.description}`, style)
  }

  // Create panel when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel)
  } else {
    createPanel()
  }
}
