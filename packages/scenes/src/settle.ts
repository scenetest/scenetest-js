import type { Page } from 'playwright'

/**
 * Wait for the page to "settle" after navigation or scope change:
 * flush pending microtasks and let the framework finish two animation
 * frames so derived state (e.g. TanStack DB live queries, React renders)
 * has a chance to materialise before the next action runs.
 *
 * Without this, a sequence like `openTo('/x') → up('topic-page')` can
 * resolve while the page is still showing a loading placeholder, because
 * `Locator.waitFor({ state: 'visible' })` only checks DOM visibility —
 * it doesn't know that the visible element will be replaced once a
 * derived collection finishes computing in a microtask.
 *
 * Two RAFs guarantee the framework has both scheduled and committed any
 * pending render. The trailing `setTimeout(0)` drains the macrotask
 * queue so post-render effects (e.g. setState in useEffect) also flush.
 */
export async function settle(page: Page): Promise<void> {
  try {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              Promise.resolve().then(() => setTimeout(resolve, 0))
            })
          })
        })
    )
  } catch {
    // Page was closed or navigated mid-settle — not our problem to recover from.
  }
}
