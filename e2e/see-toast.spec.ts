import { test, expect } from '@playwright/test'
import { waitForNewToast, claimStandingToasts } from '../packages/scenes/dist/toast.js'

/**
 * E2E tests for `seeToast` — the assertion runs in a real browser, so the
 * claim it stamps on a toast element has to survive there.
 *
 * The fixture is a toaster that mounts a fresh element per toast and pauses
 * dismissal while the pointer is over it, matching sonner (issue #246).
 */

const TOASTER = `<!doctype html><body>
<div id="toaster" style="position:fixed;bottom:0;right:0;padding:20px"
     onmouseenter="hover=true" onmouseleave="hover=false"></div>
<div id="shadow-host"></div>
<script>
  let hover = false
  const shadow = document.getElementById('shadow-host').attachShadow({ mode: 'open' })
  function toast(duration = 1500, root = toaster) {
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'toast-success')
    el.textContent = 'Saved'
    root.appendChild(el)
    const expire = () => (hover ? setTimeout(expire, 100) : el.remove())
    setTimeout(expire, duration)
  }
  function shadowToast() { toast(10_000, shadow) }
</script></body>`

declare const toast: (duration?: number) => void
declare const shadowToast: () => void

test.describe('seeToast', () => {
  test.beforeEach(async ({ page }) => {
    await page.mouse.move(0, 0)
    await page.setContent(TOASTER)
  })

  test('passes on a new toast, without waiting for it to dismiss', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    await page.evaluate(() => toast())
    const started = Date.now()
    await waitForNewToast(toasts, 'toast-success', 3000)

    // Resolved on appearance: the toast is still up, well inside its duration
    expect(Date.now() - started).toBeLessThan(500)
    await expect(toasts).toBeVisible()
  })

  test('a toast an earlier step claimed does not satisfy the next one', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    await page.evaluate(() => toast(10_000))
    await waitForNewToast(toasts, 'toast-success', 3000)

    // The action under test toasts nothing. The first toast is still on
    // screen, and must not stand in for the toast that never came.
    await expect(waitForNewToast(toasts, 'toast-success', 700)).rejects.toThrow(
      /already there before the last action/
    )
    await expect(toasts).toBeVisible()
  })

  test('a second toast passes while the first is still on screen', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    await page.evaluate(() => toast(10_000))
    await waitForNewToast(toasts, 'toast-success', 3000)
    await page.evaluate(() => toast(10_000))
    await waitForNewToast(toasts, 'toast-success', 3000)

    await expect(toasts).toHaveCount(2)
  })

  test('passes when the pointer parks on the toaster and pauses dismissal', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    // A click in the corner leaves the pointer here — the CI failure in #246
    const box = await page.locator('#toaster').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)

    await page.evaluate(() => toast())
    await waitForNewToast(toasts, 'toast-success', 3000)

    // Still up, long past its 1500ms duration, because hover paused it
    await page.waitForTimeout(2500)
    await expect(toasts).toBeVisible()
  })

  test('a toast standing before the interaction does not satisfy the next step', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    // The app toasts on load — nothing to do with the action under test
    await page.evaluate(() => toast(10_000))
    await claimStandingToasts(page)

    // …and the action under test toasts nothing
    await expect(waitForNewToast(toasts, 'toast-success', 700)).rejects.toThrow(
      /already there before the last action/
    )

    // The toast the action does produce still passes
    await page.evaluate(() => toast(10_000))
    await waitForNewToast(toasts, 'toast-success', 3000)
  })

  test('claims toasts inside an open shadow root', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    // Playwright's selectors pierce open shadow roots, so the sweep must too
    await page.evaluate(() => shadowToast())
    await expect(toasts).toBeVisible()
    await claimStandingToasts(page)

    await expect(waitForNewToast(toasts, 'toast-success', 700)).rejects.toThrow(
      /already there before the last action/
    )
  })

  test('fails with a clear message when no toast appears', async ({ page }) => {
    const toasts = page.locator('[data-testid="toast-success"]')

    await expect(waitForNewToast(toasts, 'toast-success', 400)).rejects.toThrow(
      "seeToast 'toast-success': no toast appeared within 400ms."
    )
  })
})
