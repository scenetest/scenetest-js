import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Dashboard — the Preact app served by the vite plugin at
 * /__scenetest/. It is a single Runner view over the read-only TanStack DB read
 * model, rendered into the light DOM under a `.scenetest-dashboard` root and
 * styled by the shipped stylesheet. There is no Home view and no nav tabs; the
 * base URL and the legacy `/runner` deep-link both render the Runner.
 */

test.describe('/__scenetest Dashboard', () => {
  test('the base URL renders the Runner directly (no Home, no tabs)', async ({ page }) => {
    await page.goto('/__scenetest/')

    await expect(page.locator('.runner')).toBeVisible()
    await expect(page.locator('.runner-bar .brand')).toContainText('Scenetest')
    // No Home landing, no nav tabs, no Waterfall — the removed console surface.
    await expect(page.locator('.index')).toHaveCount(0)
    await expect(page.locator('.dashboard-nav')).toHaveCount(0)
    await expect(page.locator('.tabs')).toHaveCount(0)
    await expect(page.locator('.waterfall-host')).toHaveCount(0)
  })

  test('the legacy /runner deep-link also renders the Runner', async ({ page }) => {
    await page.goto('/__scenetest/runner')
    await expect(page.locator('.runner')).toBeVisible()
    await expect(page.locator('.index')).toHaveCount(0)
  })

  test('the Runner mounts its chrome from the store (run picker + filters)', async ({ page }) => {
    await page.goto('/__scenetest/')
    // The run picker and the status filter chips render — confirms the Runner
    // actually mounted, not just an empty shell div.
    await expect(page.locator('#run-select')).toBeVisible()
    await expect(page.locator('.filters .chip')).toHaveCount(4)
    await expect(page.locator('main.two-pane')).toBeVisible()
  })
})
