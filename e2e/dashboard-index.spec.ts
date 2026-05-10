import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Preact app served by the vite plugin at
 * /__scenetest/. The index lists views; the runner is a sibling
 * route; the legacy assertions dashboard is a separate page.
 */

test.describe('/__scenetest index', () => {
  test('renders two cards linking to runner and dashboard', async ({ page }) => {
    await page.goto('/__scenetest/')

    await expect(page.locator('.index h1')).toContainText('Scenetest')
    const cards = page.locator('.index .card')
    await expect(cards).toHaveCount(2)

    const runnerCard = cards.filter({ hasText: 'Scene runner' })
    const dashboardCard = cards.filter({ hasText: 'Assertions dashboard' })
    await expect(runnerCard).toHaveAttribute('href', '/__scenetest/runner')
    await expect(dashboardCard).toHaveAttribute('href', '/__scenetest/dashboard')
  })

  test('Scene runner card navigates to /runner without full reload', async ({ page }) => {
    await page.goto('/__scenetest/')

    // Tag the window so we can detect a full reload
    await page.evaluate(() => {
      ;(window as unknown as { __sentinel: boolean }).__sentinel = true
    })

    await page.locator('.index .card', { hasText: 'Scene runner' }).click()

    await expect(page).toHaveURL(/\/__scenetest\/runner(\?|$)/)
    // Runner header is the analyze app; tabs are part of <App/>
    await expect(page.locator('header .tabs')).toBeVisible()

    // pushState navigation preserves the sentinel; full reload would clear it
    const survived = await page.evaluate(
      () => (window as unknown as { __sentinel?: boolean }).__sentinel === true
    )
    expect(survived).toBe(true)
  })

  test('back button returns from runner to the index', async ({ page }) => {
    await page.goto('/__scenetest/')
    await page.locator('.index .card', { hasText: 'Scene runner' }).click()
    await expect(page.locator('header .tabs')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/__scenetest\/?(\?|$)/)
    await expect(page.locator('.index .card')).toHaveCount(2)
  })

  test('direct navigation to /runner renders the analyze app', async ({ page }) => {
    await page.goto('/__scenetest/runner')
    await expect(page.locator('header .tabs')).toBeVisible()
    await expect(page.locator('.index')).toHaveCount(0)
  })

  test('Assertions dashboard card opens the legacy page', async ({ page }) => {
    await page.goto('/__scenetest/')
    await page.locator('.index .card', { hasText: 'Assertions dashboard' }).click()
    await expect(page).toHaveURL(/\/__scenetest\/dashboard$/)
  })
})
