import type { Locator, Page } from 'playwright'

/**
 * `seeToast` support — assert that a *new* toast appeared.
 *
 * A toast assertion has to answer one question: did the action I just ran
 * produce a toast?  Waiting for a matching element to appear can't answer it,
 * because a toast from an earlier action may still be on screen.  Waiting for
 * that element to disappear again is worse: a stale toast expiring satisfies
 * the step even when the action produced nothing.
 *
 * So a toast only counts when it appeared after the last interaction started,
 * and only once: each `seeToast` step claims one toast element, and every
 * interaction claims whatever is already on screen when it begins.  The claim
 * is a JS property on the element — invisible to the app's CSS and to every
 * selector a scene can write — set inside the page so the check and the stamp
 * can't interleave.
 *
 * Dismissal is left alone.  When a scene needs the toast gone (it covers the
 * next thing to click), it says so with `notSee`.
 */

/** Property stamped on a toast element once a `seeToast` step has claimed it. */
const CLAIMED = '__scenetestToastClaimed'

/**
 * Poll interval, in ms. Roughly two animation frames: short enough that a
 * short-lived toast is still on screen when the next poll lands.
 */
const POLL_INTERVAL_MS = 30

/**
 * - `claimed` — an unclaimed toast was visible, and this step now owns it
 * - `all-claimed` — matching toasts are visible, but earlier steps own them
 * - `none` — nothing matching is visible
 */
type ClaimResult = 'claimed' | 'all-claimed' | 'none'

/**
 * Claim the first visible element no earlier step has claimed.
 * Runs in the page, so the check and the stamp are atomic.
 */
function claimNewToast(locator: Locator): Promise<ClaimResult> {
  return locator.evaluateAll((elements: Element[], flag: string): ClaimResult => {
    let visible = 0
    for (const el of elements) {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el)
      if (el.getClientRects().length === 0 || style?.visibility === 'hidden') continue
      visible++
      if (!(flag in el)) {
        Object.defineProperty(el, flag, { value: true, configurable: true })
        return 'claimed'
      }
    }
    return visible > 0 ? 'all-claimed' : 'none'
  }, CLAIMED)
}

/**
 * Actions that can produce a toast.  Each one claims what is already on
 * screen when it starts, so a later `seeToast` only accepts a toast this
 * action produced.
 *
 * Assertions, waits and scope moves are absent on purpose: they produce
 * nothing, and claiming on one would discard the toast the scene is about to
 * assert.  `wait` between a click and its `seeToast` therefore stays safe.
 */
export const INTERACTIONS = new Set([
  'check',
  'click',
  'do',
  'goBack',
  'goForward',
  'ifClick',
  'openTo',
  'pressKey',
  'reload',
  'scrollToBottom',
  'select',
  'switchDevice',
  'typeInto',
])

/**
 * Claim every element on the page, so nothing standing there now can satisfy
 * a later `seeToast`.  Called at the start of each interaction.
 *
 * It stamps every element rather than the toasts, because the toast selector
 * belongs to the `seeToast` step and isn't known here.  The walk descends
 * into open shadow roots, since Playwright's selectors pierce them too.
 *
 * Cost is one round trip plus the walk — ≈2ms on a 1,000-element page and
 * ≈5ms at 10,000, measured in chromium.  Elements already claimed are
 * skipped, so repeat sweeps over a stable page stay at the round trip.
 */
export async function claimStandingToasts(page: Page): Promise<void> {
  try {
    await page.evaluate((flag: string) => {
      const walk = (root: Document | ShadowRoot): void => {
        for (const el of root.querySelectorAll('*')) {
          if (!(flag in el)) Object.defineProperty(el, flag, { value: true, configurable: true })
          if (el.shadowRoot) walk(el.shadowRoot)
        }
      }
      walk(document)
    }, CLAIMED)
  } catch {
    // Page closed, navigating, or not loaded yet. Nothing on it survives to
    // satisfy a later seeToast anyway.
  }
}

/**
 * Wait until a toast matching `locator` appears that no earlier `seeToast`
 * has claimed. Resolves as soon as one does — it never waits for dismissal.
 *
 * @param locator  resolved from the page root, since toasts portal out of scope
 * @param target   the selector as written, for the error message
 * @param timeout  in ms
 */
export async function waitForNewToast(locator: Locator, target: string, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout
  let result: ClaimResult = 'none'

  for (;;) {
    result = await claimNewToast(locator)
    if (result === 'claimed') return
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  if (result === 'all-claimed') {
    throw new Error(
      `seeToast '${target}': no new toast appeared within ${timeout}ms. ` +
        `A matching toast is on screen, but it was already there before the last ` +
        `action ran — seeToast only accepts a toast that appeared after it.`
    )
  }
  throw new Error(`seeToast '${target}': no toast appeared within ${timeout}ms.`)
}
