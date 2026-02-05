import type { Page, Locator } from 'playwright'

/**
 * Navigation mode for an actor.
 *
 * - `'pointer'` — default mouse/touch interaction (Playwright's normal click/fill)
 * - `'keyboard'` — navigate via Tab key and activate via Enter/Space
 *
 * Keyboard mode tests that the application is fully operable without a mouse.
 * The same `click('submit')` call works in both modes — in keyboard mode it
 * Tabs to the element and presses Enter instead of dispatching a mouse click.
 */
export type NavigationMode = 'pointer' | 'keyboard'

/**
 * Options for tabToElement
 */
interface TabToElementOptions {
  /** Maximum number of Tab presses before giving up. Default: 100. */
  maxTabs?: number
  /** Action timeout in ms (for the overall operation). */
  timeout?: number
}

/**
 * Tab forward through the page until the target element (or a focusable
 * descendant of it) receives focus.
 *
 * This simulates a real keyboard user pressing Tab repeatedly to reach
 * an interactive element.  If the element can't be reached after `maxTabs`
 * presses, it throws — indicating a keyboard-accessibility problem.
 *
 * @param page - Playwright Page
 * @param target - Locator for the element to reach
 * @param opts - Options (maxTabs, timeout)
 */
export async function tabToElement(
  page: Page,
  target: Locator,
  opts: TabToElementOptions = {}
): Promise<void> {
  const maxTabs = opts.maxTabs ?? 100
  const timeout = opts.timeout ?? 10000
  const deadline = Date.now() + timeout

  // Get a handle to the target element so we can compare in-page
  const targetHandle = await target.elementHandle({ timeout: Math.min(5000, timeout) })
  if (!targetHandle) {
    throw new Error(
      'Keyboard navigation: target element not found in DOM'
    )
  }

  // Track where we started to detect full cycles
  let startElement: unknown = null

  for (let i = 0; i < maxTabs; i++) {
    if (Date.now() > deadline) {
      throw new Error(
        `Keyboard navigation: timed out after ${timeout}ms trying to Tab to element`
      )
    }

    await page.keyboard.press('Tab')

    // Check if focus landed on or within the target element
    const result = await targetHandle.evaluate((el) => {
      const active = document.activeElement
      if (!active || active === document.body) return 'nobody'
      if (el === active || el.contains(active)) return 'found'
      // Return a stable identifier so we can detect cycles
      return active.tagName + active.id
    })

    if (result === 'found') {
      return // Successfully tabbed to element
    }

    // Detect full cycle (focus wrapped back to start)
    if (i === 0) {
      startElement = result
    } else if (i > 2 && result === startElement) {
      throw new Error(
        'Keyboard navigation: Tab focus cycled back to the starting element without ' +
        'reaching the target. The element may not be keyboard-accessible ' +
        '(missing tabindex, not a natively focusable element, or hidden from tab order).'
      )
    }
  }

  throw new Error(
    `Keyboard navigation: could not reach element via Tab after ${maxTabs} key presses. ` +
    'The element may not be keyboard-accessible (missing tabindex, not a ' +
    'natively focusable element, or the page has too many focusable elements).'
  )
}

/**
 * Press Enter on the currently focused element.
 */
export async function pressEnter(page: Page): Promise<void> {
  await page.keyboard.press('Enter')
}

/**
 * Press Space on the currently focused element.
 * Used for toggling checkboxes and activating certain controls.
 */
export async function pressSpace(page: Page): Promise<void> {
  await page.keyboard.press('Space')
}

/**
 * Type text character by character into the currently focused element.
 * Clears existing content first by selecting all.
 */
export async function clearAndType(page: Page, value: string): Promise<void> {
  // Select all existing content and delete it
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  // Type the new value character by character
  await page.keyboard.type(value)
}

/**
 * Navigate a <select> element's options using arrow keys.
 * Assumes the select is already focused.
 *
 * Strategy: open the dropdown, then press ArrowDown/ArrowUp to reach
 * the desired option, then press Enter to select it.
 *
 * For simplicity, we use a hybrid: the select is focused via Tab,
 * then we use Playwright's selectOption which works via the browser
 * API. This is a pragmatic choice — real keyboard users interact
 * with selects differently across browsers.
 */
export async function keyboardSelectOption(
  page: Page,
  target: Locator,
  value: string
): Promise<void> {
  // The element is already focused via Tab. Use selectOption which
  // works via the browser's native select API. This is consistent
  // across browsers and matches what keyboard users experience when
  // interacting with native selects (which vary by platform).
  await target.selectOption(value)
}

// ---------------------------------------------------------------------------
// NavigationModeRotation
// ---------------------------------------------------------------------------

/**
 * Assigns navigation modes to actors via round-robin rotation.
 *
 * Similar to `DeviceRotation` — each actor gets the next mode in the pool.
 * The default pool alternates: pointer, keyboard, pointer, keyboard, ...
 *
 * This means in a two-actor scene, one actor uses mouse and the other
 * navigates entirely via keyboard — catching accessibility issues
 * alongside functional testing.
 *
 * @example
 * ```ts
 * const rotation = new NavigationModeRotation()
 * rotation.next() // 'pointer'
 * rotation.next() // 'keyboard'
 * rotation.next() // 'pointer'
 * ```
 *
 * @example Custom pool
 * ```ts
 * // Only 1 in 3 actors uses keyboard
 * const rotation = new NavigationModeRotation(['pointer', 'pointer', 'keyboard'])
 * ```
 */
export class NavigationModeRotation {
  private pool: NavigationMode[]
  private index = 0

  constructor(modes?: NavigationMode[]) {
    this.pool = modes && modes.length > 0 ? modes : ['pointer', 'keyboard']
  }

  /**
   * Get the next navigation mode in rotation.
   */
  next(): NavigationMode {
    const mode = this.pool[this.index % this.pool.length]
    this.index++
    return mode
  }

  /**
   * Peek at the next mode without advancing.
   */
  peek(): NavigationMode {
    return this.pool[this.index % this.pool.length]
  }

  /**
   * Reset rotation to the beginning.
   */
  reset(): void {
    this.index = 0
  }

  /**
   * Current rotation index (for reporting).
   */
  get currentIndex(): number {
    return this.index
  }

  /**
   * The full mode pool.
   */
  get modes(): readonly NavigationMode[] {
    return this.pool
  }
}
