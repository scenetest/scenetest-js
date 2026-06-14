import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Dashboard — the Preact app served by the vite plugin at
 * /__scenetest/. It's one app (Home / Runner / Waterfall views) over the
 * read-only TanStack DB read model, routed on the pathname; views render into
 * the light DOM under a `.scenetest-dashboard` root, styled by the shipped
 * stylesheet.
 */

test.describe('/__scenetest Dashboard', () => {
  test('Home renders two cards (Scene runner, Waterfall)', async ({ page }) => {
    await page.goto('/__scenetest/')

    await expect(page.locator('.index h1')).toContainText('Scenetest')
    const cards = page.locator('.index .card')
    await expect(cards).toHaveCount(2)
    await expect(cards.filter({ hasText: 'Scene runner' })).toBeVisible()
    await expect(cards.filter({ hasText: 'Waterfall' })).toBeVisible()
    // The nav tabs are present on every view.
    await expect(page.locator('.tabs .tab')).toHaveCount(3)
  })

  test('Scene runner card navigates to /runner without a full reload', async ({ page }) => {
    await page.goto('/__scenetest/')

    // Tag the window so we can detect a full reload.
    await page.evaluate(() => {
      ;(window as unknown as { __sentinel: boolean }).__sentinel = true
    })

    await page.locator('.index .card', { hasText: 'Scene runner' }).click()

    await expect(page).toHaveURL(/\/__scenetest\/runner(\?|$)/)
    await expect(page.locator('.runner')).toBeVisible()

    // pushState navigation preserves the sentinel; a full reload would clear it.
    const survived = await page.evaluate(
      () => (window as unknown as { __sentinel?: boolean }).__sentinel === true
    )
    expect(survived).toBe(true)
  })

  test('back button returns from the Runner to Home', async ({ page }) => {
    await page.goto('/__scenetest/')
    await page.locator('.index .card', { hasText: 'Scene runner' }).click()
    await expect(page.locator('.runner')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/__scenetest\/?(\?|$)/)
    await expect(page.locator('.index .card')).toHaveCount(2)
  })

  test('direct navigation to /runner renders the Runner view', async ({ page }) => {
    await page.goto('/__scenetest/runner')
    await expect(page.locator('.runner')).toBeVisible()
    await expect(page.locator('.index')).toHaveCount(0)
  })

  test('Waterfall card opens the Waterfall view', async ({ page }) => {
    await page.goto('/__scenetest/')
    await page.locator('.index .card', { hasText: 'Waterfall' }).click()
    await expect(page).toHaveURL(/\/__scenetest\/waterfall(\?|$)/)
    // With no run the Waterfall shows its empty state — confirms the view
    // actually rendered from the store.
    await expect(page.locator('.waiting')).toContainText('Waiting for scene run')
  })
})
