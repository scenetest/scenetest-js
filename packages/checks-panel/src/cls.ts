/**
 * CLS (Cumulative Layout Shift) and element flash tracker.
 *
 * Watches elements with `aria-label` attributes:
 * - Flash detection: records when a labeled element disappears and reappears
 *   in the DOM (component remounts, conditional rendering glitches).
 * - Shift detection: uses the PerformanceObserver layout-shift API to
 *   record when labeled elements shift position on screen.
 *
 * Convention: add an aria-label to any element you want CLS-tracked,
 * and scenetest will surface flash/shift events in the dev panel.
 */

import type { CLSEvent } from './types.js'
import { addCLSEvent } from './state.js'

/**
 * Pending removal — we hold onto removed labels briefly to detect
 * flash (remove then re-add) vs. permanent removal.
 */
interface PendingRemoval {
  label: string
  removedAt: number
  timeout: ReturnType<typeof setTimeout>
}

/** How long after removal before we stop watching for a re-add (ms) */
const FLASH_WINDOW_MS = 1000

/** Minimum gap to report — sub-frame removals (< 16ms) are noise */
const MIN_FLASH_GAP_MS = 16

/** Track pending removals keyed by label */
const pendingRemovals = new Map<string, PendingRemoval>()

/** Track which labels are currently in the DOM so we can diff */
let trackedLabels = new Set<string>()

/** Callback invoked for every new CLS event (panel update hook) */
let onEvent: ((event: CLSEvent) => void) | null = null

/** Active observers — kept so we can stop them */
let mutationObserver: MutationObserver | null = null
let layoutShiftObserver: PerformanceObserver | null = null

// ───────────────────── helpers ─────────────────────

/**
 * Scan the document for all elements with aria-label and return
 * the set of label values.
 */
function scanLabels(): Set<string> {
  const labels = new Set<string>()
  const els = document.querySelectorAll('[aria-label]')
  for (const el of els) {
    const label = el.getAttribute('aria-label')
    if (label) labels.add(label)
  }
  return labels
}

/**
 * Handle a label being removed from the DOM.
 * Starts a timer — if the label reappears within FLASH_WINDOW_MS,
 * we record a flash event.
 */
function handleLabelRemoved(label: string): void {
  // If we already have a pending removal for this label, ignore
  if (pendingRemovals.has(label)) return

  const removedAt = Date.now()
  const timeout = setTimeout(() => {
    // Window expired — this was a real removal, not a flash
    pendingRemovals.delete(label)
  }, FLASH_WINDOW_MS)

  pendingRemovals.set(label, { label, removedAt, timeout })
}

/**
 * Handle a label being added to the DOM.
 * If there's a pending removal for this label, it's a flash.
 */
function handleLabelAdded(label: string): void {
  const pending = pendingRemovals.get(label)
  if (!pending) return

  // It's a flash — element disappeared and came back
  clearTimeout(pending.timeout)
  pendingRemovals.delete(label)

  const gapMs = Date.now() - pending.removedAt
  if (gapMs < MIN_FLASH_GAP_MS) return // too fast, likely same frame

  const event: CLSEvent = {
    type: 'flash',
    label,
    timestamp: Date.now(),
    gapMs,
  }

  addCLSEvent(event)
  logCLSEvent(event)
  if (onEvent) onEvent(event)
}

// ───────────────────── mutation observer ─────────────────────

function startMutationObserver(): void {
  // Initial scan
  trackedLabels = scanLabels()

  mutationObserver = new MutationObserver(() => {
    const currentLabels = scanLabels()

    // Detect removals: labels that were tracked but are no longer present
    for (const label of trackedLabels) {
      if (!currentLabels.has(label)) {
        handleLabelRemoved(label)
      }
    }

    // Detect additions: labels that are now present but weren't before
    for (const label of currentLabels) {
      if (!trackedLabels.has(label)) {
        handleLabelAdded(label)
      }
    }

    trackedLabels = currentLabels
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  })
}

// ───────────────────── layout shift observer ─────────────────────

function startLayoutShiftObserver(): void {
  // PerformanceObserver for layout-shift is not available in all browsers
  if (typeof PerformanceObserver === 'undefined') return

  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // layout-shift entries have a `sources` array with the shifting elements
        const shiftEntry = entry as PerformanceEntry & {
          value?: number
          hadRecentInput?: boolean
          sources?: Array<{ node?: Node }>
        }

        // Ignore shifts caused by user input (scrolling, clicking, etc.)
        if (shiftEntry.hadRecentInput) continue

        const shiftValue = shiftEntry.value ?? 0
        if (shiftValue === 0) continue

        // Check if any shifting elements have aria-labels
        const sources = shiftEntry.sources ?? []
        for (const source of sources) {
          const node = source.node
          if (!node || !(node instanceof Element)) continue

          // Check the element itself
          const label = node.getAttribute('aria-label')
          if (label) {
            const event: CLSEvent = {
              type: 'shift',
              label,
              timestamp: Date.now(),
              shiftValue,
            }
            addCLSEvent(event)
            logCLSEvent(event)
            if (onEvent) onEvent(event)
            continue
          }

          // Check if a labeled ancestor shifted
          const labeledParent = node.closest('[aria-label]')
          if (labeledParent) {
            const parentLabel = labeledParent.getAttribute('aria-label')
            if (parentLabel) {
              const event: CLSEvent = {
                type: 'shift',
                label: parentLabel,
                timestamp: Date.now(),
                shiftValue,
              }
              addCLSEvent(event)
              logCLSEvent(event)
              if (onEvent) onEvent(event)
            }
          }
        }
      }
    })

    layoutShiftObserver.observe({ type: 'layout-shift', buffered: false })
  } catch {
    // layout-shift entry type not supported in this browser
  }
}

// ───────────────────── console logging ─────────────────────

function logCLSEvent(event: CLSEvent): void {
  const icon = event.type === 'flash' ? '\u26A1' : '\u21C4'
  const style = 'color: #f59e0b'

  if (event.type === 'flash') {
    console.log(
      `%c${icon} [scenetest:cls] "${event.label}" flashed off/on (gone ${event.gapMs}ms)`,
      style
    )
  } else {
    const score = event.shiftValue?.toFixed(4) ?? '?'
    console.log(
      `%c${icon} [scenetest:cls] "${event.label}" shifted (score ${score})`,
      style
    )
  }
}

// ───────────────────── public API ─────────────────────

/**
 * Start tracking CLS for elements with aria-label.
 * @param callback Called each time a CLS event is recorded (for panel updates).
 */
export function startCLSTracker(callback: (event: CLSEvent) => void): void {
  onEvent = callback
  startMutationObserver()
  startLayoutShiftObserver()
}

/**
 * Stop all CLS tracking observers.
 */
export function stopCLSTracker(): void {
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
  if (layoutShiftObserver) {
    layoutShiftObserver.disconnect()
    layoutShiftObserver = null
  }
  onEvent = null

  // Clean up pending removals
  for (const pending of pendingRemovals.values()) {
    clearTimeout(pending.timeout)
  }
  pendingRemovals.clear()
  trackedLabels.clear()
}
