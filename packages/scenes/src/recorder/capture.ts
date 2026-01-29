/**
 * Event capture system for the recorder.
 *
 * Intercepts user interactions (click, type, check, select, navigate)
 * and translates them into DSL lines using reverse selector resolution.
 */

import { reverseSelector, nearestAddressable, explainUnaddressable } from './reverse-selector.js'
import type { RecorderState, DslLine, PendingInput } from './types.js'

/** How long to wait after the last keystroke before finalizing a typeInto line */
const INPUT_DEBOUNCE_MS = 600

/** Callback for when a new DSL line is recorded */
type OnLine = (line: DslLine) => void

/** Callback for when an element has no selector */
type OnWarning = (message: string) => void

/**
 * Set up event capture on the document.
 * Returns a cleanup function to remove all listeners.
 */
export function startCapture(
  state: RecorderState,
  onLine: OnLine,
  onWarning: OnWarning,
): () => void {
  const cleanups: Array<() => void> = []

  // --- Click capture ---
  function handleClick(e: MouseEvent) {
    if (!state.recording) return

    const target = e.target as Element
    if (!target || isRecorderElement(target)) return

    // Flush any pending input first
    flushPendingInput(state, onLine)

    // Special case: if clicking an input/textarea/select, don't emit click
    // (the input/change handler will handle it)
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return
    }

    // Also skip if clicking a label (it will trigger the input focus)
    if (tag === 'label') return

    const selector = resolveTarget(target)
    if (!selector) {
      onWarning(explainUnaddressable(target))
      return
    }

    // Check if it's a checkbox or radio being clicked
    const inputChild = target.querySelector('input[type="checkbox"], input[type="radio"]')
    if (inputChild) {
      const inputSelector = reverseSelector(inputChild) || selector
      addLine(state, `check ${inputSelector}`, onLine)
      return
    }

    addLine(state, `click ${selector}`, onLine)
  }

  // --- Input capture (for typeInto) ---
  function handleInput(e: Event) {
    if (!state.recording) return

    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    if (!target || isRecorderElement(target)) return

    const tag = target.tagName.toLowerCase()
    if (tag !== 'input' && tag !== 'textarea') return

    // Skip checkboxes and radios (handled by change)
    const type = target.getAttribute('type')?.toLowerCase()
    if (type === 'checkbox' || type === 'radio') return

    const selector = resolveTarget(target)
    if (!selector) {
      onWarning(explainUnaddressable(target))
      return
    }

    const value = target.value

    // If there's already a pending input for the same element, update it
    if (state.pendingInput && state.pendingInput.element === target) {
      clearTimeout(state.pendingInput.timer)
      state.pendingInput.value = value
      state.pendingInput.timer = setTimeout(() => {
        flushPendingInput(state, onLine)
      }, INPUT_DEBOUNCE_MS)
      return
    }

    // Flush any previous pending input
    flushPendingInput(state, onLine)

    // Start new pending input
    state.pendingInput = {
      element: target,
      selector,
      value,
      timer: setTimeout(() => {
        flushPendingInput(state, onLine)
      }, INPUT_DEBOUNCE_MS),
    }
  }

  // --- Change capture (for select, checkbox) ---
  function handleChange(e: Event) {
    if (!state.recording) return

    const target = e.target as HTMLElement
    if (!target || isRecorderElement(target)) return

    const tag = target.tagName.toLowerCase()
    const type = (target as HTMLInputElement).getAttribute('type')?.toLowerCase()

    const selector = resolveTarget(target)
    if (!selector) {
      onWarning(explainUnaddressable(target))
      return
    }

    if (tag === 'select') {
      flushPendingInput(state, onLine)
      const value = (target as HTMLSelectElement).value
      addLine(state, `select ${selector} ${value}`, onLine)
    } else if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      flushPendingInput(state, onLine)
      addLine(state, `check ${selector}`, onLine)
    }
  }

  // --- Navigation capture ---
  // Intercept pushState and replaceState to detect SPA navigation
  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)
  let lastRecordedPath = location.pathname + location.search

  function handleNavigation() {
    if (!state.recording) return

    const newPath = location.pathname + location.search
    if (newPath !== lastRecordedPath) {
      flushPendingInput(state, onLine)
      lastRecordedPath = newPath
      addLine(state, `openTo ${newPath}`, onLine)
    }
  }

  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args)
    handleNavigation()
  }

  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args)
    handleNavigation()
  }

  function handlePopState() {
    handleNavigation()
  }

  // --- Scroll capture ---
  // We only capture explicit scroll-to-bottom actions, not all scrolls
  // This is detected when the user scrolls to within 5px of the bottom
  let scrollTimer: ReturnType<typeof setTimeout> | null = null

  function handleScroll(e: Event) {
    if (!state.recording) return

    const target = e.target as HTMLElement
    if (!target || target === document.documentElement || isRecorderElement(target)) return

    // Debounce scroll events
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      // Check if scrolled to bottom
      const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 5
      if (isAtBottom && target.scrollHeight > target.clientHeight + 50) {
        addLine(state, 'scrollToBottom', onLine)
      }
    }, 300)
  }

  // --- Attach listeners ---
  document.addEventListener('click', handleClick, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('change', handleChange, true)
  window.addEventListener('popstate', handlePopState)
  document.addEventListener('scroll', handleScroll, true)

  cleanups.push(
    () => document.removeEventListener('click', handleClick, true),
    () => document.removeEventListener('input', handleInput, true),
    () => document.removeEventListener('change', handleChange, true),
    () => window.removeEventListener('popstate', handlePopState),
    () => document.removeEventListener('scroll', handleScroll, true),
    () => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    },
  )

  return () => {
    flushPendingInput(state, onLine)
    cleanups.forEach(fn => fn())
  }
}

// --- Helpers ---

function addLine(state: RecorderState, text: string, onLine: OnLine): void {
  const line: DslLine = {
    id: state.nextId++,
    text,
    timestamp: Date.now(),
    played: true,
  }
  state.lines.push(line)
  onLine(line)
}

function flushPendingInput(state: RecorderState, onLine: OnLine): void {
  const pending: PendingInput | null = state.pendingInput
  if (!pending) return

  clearTimeout(pending.timer)
  state.pendingInput = null

  if (pending.value) {
    addLine(state, `typeInto ${pending.selector} ${pending.value}`, onLine)
  }
}

function resolveTarget(element: Element): string | null {
  // First try the element itself
  const direct = reverseSelector(element)
  if (direct) return direct

  // Try the nearest addressable ancestor
  const ancestor = nearestAddressable(element)
  if (ancestor) {
    return reverseSelector(ancestor)
  }

  return null
}

function isRecorderElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current.id === 'scenecheck-recorder' || current.id === 'scenecheck-panel') {
      return true
    }
    current = current.parentElement
  }
  return false
}
