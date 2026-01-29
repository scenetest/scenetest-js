/**
 * Scenecheck Scene Recorder
 *
 * Records user interactions as DSL lines in a live sidebar panel.
 * Captures clicks, typing, navigation, and annotates with inline assertions.
 *
 * Usage:
 *   import { initRecorder } from '@scenecheck/scenes/recorder'
 *   initRecorder()
 *
 * Or auto-init:
 *   import '@scenecheck/scenes/recorder/auto'
 */

import type { RecorderState, DslLine, AssertionAnnotation } from './types.js'
import { startCapture } from './capture.js'
import {
  createRecorderPanel,
  attachPanelListeners,
  appendLine,
  appendAnnotation,
  appendWarning,
  removeLine,
  clearPanel,
  setRecordingState,
} from './panel.js'

// Re-export types
export type { DslLine, AssertionAnnotation, RecorderState } from './types.js'

declare global {
  interface Window {
    __scenecheck_recorder?: boolean
    __scenecheck_report?: (result: AssertionResult) => void
  }
}

interface AssertionResult {
  type: 'pass' | 'fail'
  description: string
  result: boolean
  timestamp: number
  stack?: string
  context?: Record<string, unknown>
  location?: { file: string; line: number; column: number }
}

/**
 * Global recorder state
 */
const state: RecorderState = {
  recording: true,
  lines: [],
  annotations: [],
  nextId: 1,
  pendingInput: null,
}

let stopCapture: (() => void) | null = null

/**
 * Initialize the scene recorder.
 * Creates the sidebar panel, starts event capture, and hooks into assertions.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initRecorder(): void {
  if (typeof window === 'undefined') {
    console.warn('[scenecheck/recorder] initRecorder() called in non-browser environment')
    return
  }

  if (window.__scenecheck_recorder) {
    return
  }

  window.__scenecheck_recorder = true

  console.log(
    '%c\u23FA scenecheck recorder',
    'color: #c792ea; font-weight: bold'
  )

  // Create panel when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup)
  } else {
    setup()
  }
}

function setup(): void {
  // Create the sidebar panel
  createRecorderPanel()

  // Wire up panel event handlers
  attachPanelListeners({
    onToggleRecording: () => {
      if (!state.recording) {
        resumeRecording()
      }
    },
    onPause: () => {
      if (state.recording) {
        pauseRecording()
      }
    },
    onClear: () => {
      state.lines = []
      state.annotations = []
      state.nextId = 1
      clearPanel()
    },
    onExport: () => {
      exportDsl()
    },
    onDeleteLine: (lineId: number) => {
      state.lines = state.lines.filter(l => l.id !== lineId)
      state.annotations = state.annotations.filter(a => a.afterLineId !== lineId)
      removeLine(lineId)
    },
  })

  // Start capturing events
  stopCapture = startCapture(
    state,
    (line: DslLine) => {
      appendLine(line, state.lines.length - 1)
    },
    (message: string) => {
      appendWarning(message)
    },
  )

  // Hook into assertion reporting
  hookAssertions()
}

/**
 * Hook into window.__scenecheck_report to capture assertions
 * and display them as inline annotations in the recorder.
 */
function hookAssertions(): void {
  const existingReport = window.__scenecheck_report

  window.__scenecheck_report = function (result: AssertionResult): void {
    // Forward to existing reporter (observer panel, Playwright, etc.)
    if (existingReport) {
      try {
        existingReport(result)
      } catch {
        // Ignore errors
      }
    }

    // Only annotate if we're recording and have lines
    if (!state.recording || state.lines.length === 0) return

    const lastLine = state.lines[state.lines.length - 1]
    const annotation: AssertionAnnotation = {
      afterLineId: lastLine.id,
      type: result.result ? 'pass' : 'fail',
      description: result.description,
      timestamp: Date.now(),
    }

    state.annotations.push(annotation)
    appendAnnotation(annotation)
  }
}

/**
 * Pause recording
 */
function pauseRecording(): void {
  state.recording = false
  setRecordingState(false)
  console.log('%c\u23F8 recorder paused', 'color: #6a6a8a')
}

/**
 * Resume recording
 */
function resumeRecording(): void {
  state.recording = true
  setRecordingState(true)
  console.log('%c\u23FA recorder resumed', 'color: #c792ea')
}

/**
 * Export the current DSL lines as a downloadable .spec.md file
 * in the formal screenplay-cue format.
 */
function exportDsl(): void {
  if (state.lines.length === 0) {
    console.warn('[scenecheck/recorder] Nothing to export')
    return
  }

  // Generate scene name from current page path
  const pagePath = location.pathname
    .replace(/^\//, '')
    .replace(/\//g, ' ')
    .trim()
    || 'recorded scene'

  // Build the formal markdown DSL format:
  // ## scene-name
  // user:
  // - action selector
  // - action selector value
  const lines = [
    `## ${pagePath}`,
    'user:',
    ...state.lines.map(l => `- ${l.text}`),
    '', // trailing newline
  ]

  const content = lines.join('\n')

  // Generate filename
  const pathSlug = location.pathname
    .replace(/^\//, '')
    .replace(/\//g, '-')
    || 'scene'

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  const filename = `${pathSlug}-${timestamp}.spec.md`

  // Create and trigger download
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)

  console.log(`%c\u2193 exported ${state.lines.length} lines to ${filename}`, 'color: #4ade80')
}

/**
 * Get the current DSL lines as a string array.
 * Useful for programmatic access.
 */
export function getDslLines(): string[] {
  return state.lines.map(l => l.text)
}

/**
 * Get the full recorder state.
 * Useful for testing and debugging.
 */
export function getRecorderState(): RecorderState {
  return state
}

/**
 * Programmatically stop the recorder and clean up.
 */
export function destroyRecorder(): void {
  if (stopCapture) {
    stopCapture()
    stopCapture = null
  }

  const el = document.getElementById('scenecheck-recorder')
  if (el) {
    el.remove()
  }

  window.__scenecheck_recorder = false
  document.documentElement.style.removeProperty('--scenecheck-recorder-width')
}
