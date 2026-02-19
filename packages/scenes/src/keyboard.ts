import type { Page, Locator } from 'playwright'

/**
 * Navigation mode for an actor.
 *
 * - `'pointer'` — mouse/touch interaction. When fuzzy-fingers is enabled,
 *   clicks occasionally miss the target first, pause, then click correctly
 *   (simulating imprecise human touch input).
 *
 * - `'keyboard'` — navigate entirely via Tab key and activate via Enter/Space.
 *   Tests that the app is keyboard-accessible.
 *
 * All modes are transparent to test authors. The same `click('submit')` call
 * works in every mode.
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
// Fuzzy-finger (imprecise touch) helpers
// ---------------------------------------------------------------------------

/**
 * Fuzzy-finger strategy, alternated per interaction:
 *
 * - `'miss-center'` — clicks 15px from the element's center instead of
 *   dead-center.  Tests WCAG 2.5.8 minimum target size (24×24 CSS-px).
 *
 * - `'miss-edge'` — clicks a few pixels *outside* the element's bounding
 *   box.  Tests touch-target *spacing* between neighbors.
 *
 * Both strategies follow the same flow: miss → pause → correct click.
 * If the correct click succeeds, we move on silently (humans miss all
 * the time). If the correct click fails because the element vanished
 * (the mis-click activated something else), we throw FuzzyFingerError.
 */
type FuzzyFingerStrategy = 'miss-center' | 'miss-edge'

/** Global counter — alternates strategy on every fuzzy-finger interaction. */
let fuzzyFingerCounter = 0

function nextStrategy(): FuzzyFingerStrategy {
  return fuzzyFingerCounter++ % 2 === 0 ? 'miss-center' : 'miss-edge'
}

// -- miss-center helpers ----------------------------------------------------

/**
 * Distance from center for the miss-center strategy (px).
 *
 * WCAG 2.5.8 requires a minimum 24×24 CSS-px target size, so the
 * center-to-edge distance is 12px.  Clicking 15px from center will
 * miss a compliant-minimum element, surfacing undersized targets.
 */
const CENTER_OFFSET_PX = 15

/**
 * Pick a random point that is CENTER_OFFSET_PX away from the
 * element's center, in a random direction.
 */
function missCenterPoint(box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const angle = Math.random() * 2 * Math.PI
  return {
    x: cx + CENTER_OFFSET_PX * Math.cos(angle),
    y: cy + CENTER_OFFSET_PX * Math.sin(angle),
  }
}

// -- miss-edge helpers ------------------------------------------------------

/**
 * Overshoot distance beyond the element edge (px).
 *
 * We land 3px *outside* the bounding box.  If the element meets the
 * WCAG minimum (12px from center to edge), the mis-tap ends up ~15px
 * from center — outside the target but close enough to hit a neighbor
 * that is packed too tightly.
 */
const EDGE_OVERSHOOT_PX = 3

/**
 * Pick a random point just outside the element's bounding box.
 *
 * Strategy: pick a random edge (top / right / bottom / left),
 * place the coordinate EDGE_OVERSHOOT_PX beyond that edge, and
 * randomize position along the edge so we don't always hit the
 * same neighbor.
 */
function missEdgePoint(box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const edge = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left
  const t = 0.2 + Math.random() * 0.6 // bias toward center of edge, not corners

  switch (edge) {
    case 0: // top — above the element
      return { x: box.x + box.width * t, y: box.y - EDGE_OVERSHOOT_PX }
    case 1: // right — past the right edge
      return { x: box.x + box.width + EDGE_OVERSHOOT_PX, y: box.y + box.height * t }
    case 2: // bottom — below the element
      return { x: box.x + box.width * t, y: box.y + box.height + EDGE_OVERSHOOT_PX }
    case 3: // left — past the left edge
    default:
      return { x: box.x - EDGE_OVERSHOOT_PX, y: box.y + box.height * t }
  }
}

// -- shared helpers ---------------------------------------------------------

/**
 * Probability of a mis-click on any given interaction.
 * ~20% (1 in 5) — most clicks go through cleanly, but every now and
 * then one goes slightly astray.
 */
const MISS_PROBABILITY = 0.2

/**
 * Returns true if this interaction should be a mis-click.
 */
function shouldMiss(): boolean {
  return Math.random() < MISS_PROBABILITY
}

/**
 * Pause duration (ms) after a mis-click before the correction.
 * Short pause — human noticing the miss and re-tapping.
 */
const FUZZY_PAUSE_MS = 100

// -- diagnostic error -------------------------------------------------------

/**
 * Thrown when a fuzzy-finger mis-click caused the target element to
 * vanish (because the mis-click activated a neighboring element that
 * navigated away or altered the DOM).
 *
 * This is a real UX problem: touch targets are too close together.
 * The `strategy` field tells you which test surfaced the issue:
 * - `'miss-center'` → element is undersized (WCAG 2.5.8)
 * - `'miss-edge'`   → element is too close to a neighbor
 */
export class FuzzyFingerError extends Error {
  readonly strategy: FuzzyFingerStrategy
  readonly selector: string
  readonly originalError: Error

  constructor(strategy: FuzzyFingerStrategy, selector: string, originalError: Error) {
    const reason = strategy === 'miss-center'
      ? `target too small (mis-click ${CENTER_OFFSET_PX}px from center hit something else — WCAG 2.5.8 requires minimum 24×24 CSS-px)`
      : `target too close to neighbor (mis-click ${EDGE_OVERSHOOT_PX}px outside edge activated adjacent element)`
    super(`Fuzzy-finger failure on "${selector}": ${reason}`)
    this.name = 'FuzzyFingerError'
    this.strategy = strategy
    this.selector = selector
    this.originalError = originalError
  }
}

// -- exported fuzzy-finger actions ------------------------------------------

/**
 * Fuzzy-finger click: miss → pause → correct click.
 *
 * Simulates imprecise human touch input. The mis-click lands either
 * 15px from center (testing target size) or just outside the bounding
 * box (testing target spacing), alternating between strategies.
 *
 * After the mis-click, pauses ~1s (like a human noticing the miss),
 * then clicks the correct element. If the correct click succeeds,
 * we move on silently — humans miss all the time, no big deal.
 *
 * If the correct click *fails* (element vanished because the mis-click
 * activated a neighbor), we throw FuzzyFingerError — that's a real
 * touch-target problem in the UI.
 */
export async function fuzzyFingerClick(
  page: Page,
  target: Locator,
  timeout: number,
  selector = '(scope)'
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout })

  // ~1 in 5 clicks will miss — most go through cleanly
  if (shouldMiss()) {
    const strategy = nextStrategy()
    const box = await target.boundingBox({ timeout })

    if (box) {
      // Step 1: Miss click
      const missPoint = strategy === 'miss-center' ? missCenterPoint(box) : missEdgePoint(box)
      await page.mouse.click(missPoint.x, missPoint.y)

      // Step 2: Pause (human noticing the miss)
      await new Promise(resolve => setTimeout(resolve, FUZZY_PAUSE_MS))
    }

    // Step 3: Correct click — this is where we detect problems
    try {
      await target.click({ timeout })
    } catch (err) {
      // The correct click failed. Did the element vanish because our
      // mis-click activated something else?
      const stillExists = await target.count() > 0
      if (!stillExists) {
        // Element is gone — the mis-click caused navigation or DOM change
        throw new FuzzyFingerError(strategy, selector, err instanceof Error ? err : new Error(String(err)))
      }
      // Element still exists but click failed for another reason — real bug
      throw err
    }
    return
  }

  // Normal click (no mis-click this time)
  await target.click({ timeout })
}

/**
 * Fuzzy-finger fill: miss → pause → correct click → fill.
 */
export async function fuzzyFingerFill(
  page: Page,
  target: Locator,
  value: string,
  timeout: number,
  selector = '(scope)'
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout })

  if (shouldMiss()) {
    const strategy = nextStrategy()
    const box = await target.boundingBox({ timeout })

    if (box) {
      const missPoint = strategy === 'miss-center' ? missCenterPoint(box) : missEdgePoint(box)
      await page.mouse.click(missPoint.x, missPoint.y)
      await new Promise(resolve => setTimeout(resolve, FUZZY_PAUSE_MS))
    }

    try {
      await target.fill(value, { timeout })
    } catch (err) {
      const stillExists = await target.count() > 0
      if (!stillExists) {
        throw new FuzzyFingerError(strategy, selector, err instanceof Error ? err : new Error(String(err)))
      }
      throw err
    }
    return
  }

  await target.fill(value, { timeout })
}

/**
 * Fuzzy-finger check: miss → pause → correct check.
 */
export async function fuzzyFingerCheck(
  page: Page,
  target: Locator,
  timeout: number,
  selector = '(scope)'
): Promise<void> {
  await target.waitFor({ state: 'visible', timeout })

  if (shouldMiss()) {
    const strategy = nextStrategy()
    const box = await target.boundingBox({ timeout })

    if (box) {
      const missPoint = strategy === 'miss-center' ? missCenterPoint(box) : missEdgePoint(box)
      await page.mouse.click(missPoint.x, missPoint.y)
      await new Promise(resolve => setTimeout(resolve, FUZZY_PAUSE_MS))
    }

    try {
      await target.check({ timeout })
    } catch (err) {
      const stillExists = await target.count() > 0
      if (!stillExists) {
        throw new FuzzyFingerError(strategy, selector, err instanceof Error ? err : new Error(String(err)))
      }
      throw err
    }
    return
  }

  await target.check({ timeout })
}

// ---------------------------------------------------------------------------
// NavigationModeRotation
// ---------------------------------------------------------------------------

/**
 * Assigns navigation modes to actors via round-robin rotation.
 *
 * The default pool alternates: pointer, keyboard.
 * Fuzzy-finger behavior is controlled separately and applies to
 * pointer-mode actors.
 *
 * @example
 * ```ts
 * const rotation = new NavigationModeRotation()
 * rotation.next() // 'pointer'
 * rotation.next() // 'keyboard'
 * rotation.next() // 'pointer'
 * ```
 *
 * @example Keyboard only disabled
 * ```ts
 * const rotation = new NavigationModeRotation(['pointer'])
 * rotation.next() // 'pointer'
 * rotation.next() // 'pointer'
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
