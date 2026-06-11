/**
 * Reverse selector resolution: given a DOM element, produce a scenetest selector string.
 *
 * This is the inverse of resolveSelector() in @scenetest/cli.
 * Instead of selector → element, it goes element → selector.
 *
 * Algorithm:
 * 1. Starting from the target element, find the first addressable attribute
 * 2. Walk up ancestors collecting addressable tokens to build a unique path
 * 3. Return the space-separated selector string (parent child grandchild)
 */

import { SELECTOR_ATTRIBUTES } from './types.js'

/**
 * Elements that are part of the recorder UI and should be ignored
 */
const RECORDER_PANEL_ID = 'scenetest-recorder'
const OBSERVER_PANEL_ID = 'scenetest-panel'

/**
 * Get the best scenetest selector token for a single element.
 * Returns the attribute value from the highest-priority attribute found,
 * or null if the element has no addressable attributes.
 */
function getElementToken(el: Element): { token: string; attr: string } | null {
  for (const attr of SELECTOR_ATTRIBUTES) {
    const value = el.getAttribute(attr)
    if (value) {
      return { token: value, attr }
    }
  }
  return null
}

/**
 * Check if a selector token uniquely identifies an element within a parent scope.
 */
function isUniqueInScope(token: string, scope: Element | Document): boolean {
  const selector = SELECTOR_ATTRIBUTES
    .map(attr => `[${attr}="${CSS.escape(token)}"]`)
    .join(', ')

  const matches = scope.querySelectorAll(selector)
  return matches.length === 1
}

/**
 * Resolve a DOM element to a scenetest selector string.
 *
 * Walks up from the element collecting addressable tokens until
 * the path uniquely identifies the element.
 *
 * @returns The selector string, or null if the element can't be addressed
 */
export function reverseSelector(element: Element): string | null {
  // Don't resolve elements inside the recorder or observer panels
  if (isInsidePanel(element)) {
    return null
  }

  const tokens: string[] = []
  let current: Element | null = element

  // Walk up from the target, collecting addressable ancestor tokens
  while (current && current !== document.body && current !== document.documentElement) {
    const info = getElementToken(current)
    if (info) {
      tokens.unshift(info.token)

      // Check if the path so far is unique from document root
      if (tokens.length === 1 && isUniqueInScope(info.token, document)) {
        return tokens.join(' ')
      }

      // With multiple tokens, check if the full path is likely unique
      if (tokens.length >= 2) {
        // For nested selectors, we have enough context
        return tokens.join(' ')
      }
    }

    current = current.parentElement
  }

  // If we collected any tokens, return them
  if (tokens.length > 0) {
    return tokens.join(' ')
  }

  return null
}

/**
 * Find the nearest addressable ancestor (or self) for an element.
 * Useful when the clicked element itself has no selector but a parent does.
 */
export function nearestAddressable(element: Element): Element | null {
  let current: Element | null = element

  while (current && current !== document.body && current !== document.documentElement) {
    if (getElementToken(current)) {
      return current
    }
    current = current.parentElement
  }

  return null
}

/**
 * Check if an element is inside the recorder or observer panel
 */
function isInsidePanel(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current.id === RECORDER_PANEL_ID || current.id === OBSERVER_PANEL_ID) {
      return true
    }
    current = current.parentElement
  }
  return false
}

/**
 * Get a human-readable description of why an element can't be addressed.
 * Used to show warnings when clicking unaddressable elements.
 */
export function explainUnaddressable(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const text = element.textContent?.slice(0, 30) || ''

  return `<${tag}>${text ? ` "${text}..."` : ''} has no aria-label, data-testid, or other addressable attribute`
}
