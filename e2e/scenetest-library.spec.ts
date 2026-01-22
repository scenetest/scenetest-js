import { test, expect } from '@playwright/test'

/**
 * E2E tests for the scenetest library itself.
 * These verify that the core functionality works correctly.
 */

test.describe('scenetest core functionality', () => {
  test('pass() and fail() call __scenetest_report when available', async ({
    page,
  }) => {
    const reportedAssertions: unknown[] = []

    // Expose the report function before navigating
    await page.exposeFunction('__scenetest_report', (result: unknown) => {
      reportedAssertions.push(result)
    })

    await page.goto('/')

    // Wait for profile to load (triggers initial assertions)
    await page.waitForSelector('[data-testid="display-name"]')
    await page.waitForTimeout(100)

    // Assertions should have been reported
    expect(reportedAssertions.length).toBeGreaterThan(0)

    // Each reported assertion should have the expected structure
    const firstAssertion = reportedAssertions[0] as Record<string, unknown>
    expect(firstAssertion).toHaveProperty('type')
    expect(firstAssertion).toHaveProperty('description')
    expect(firstAssertion).toHaveProperty('result')
    expect(['pass', 'fail']).toContain(firstAssertion.type)
  })

  test('assertions include source location (file and line)', async ({
    page,
  }) => {
    const reportedAssertions: unknown[] = []

    await page.exposeFunction('__scenetest_report', (result: unknown) => {
      reportedAssertions.push(result)
    })

    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')
    await page.waitForTimeout(100)

    // Find an assertion with location info
    const assertionWithLocation = reportedAssertions.find(
      (a) => (a as Record<string, unknown>).location
    ) as Record<string, unknown> | undefined

    expect(assertionWithLocation).toBeDefined()
    const location = assertionWithLocation?.location as Record<string, unknown>
    expect(location?.file).toContain('App.tsx')
    expect(typeof location?.line).toBe('number')
  })

  test('context data is passed through to report', async ({ page }) => {
    const reportedAssertions: unknown[] = []

    await page.exposeFunction('__scenetest_report', (result: unknown) => {
      reportedAssertions.push(result)
    })

    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')

    // Trigger form submission which includes context in assertions
    await page.locator('[data-testid="name-input"]').clear()
    await page.locator('[data-testid="name-input"]').fill('Test Name')
    await page.locator('[data-testid="submit-button"]').click()
    await page.waitForSelector('[data-testid="success"]')
    await page.waitForTimeout(200)

    // Find an assertion that includes context
    const assertionWithContext = reportedAssertions.find(
      (a) => (a as Record<string, unknown>).context
    ) as Record<string, unknown> | undefined

    expect(assertionWithContext).toBeDefined()
    expect(assertionWithContext?.context).toBeInstanceOf(Object)
  })

  test('pass() reports result=true, fail() reports result=false', async ({
    page,
  }) => {
    const reportedAssertions: unknown[] = []

    await page.exposeFunction('__scenetest_report', (result: unknown) => {
      reportedAssertions.push(result)
    })

    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')
    await page.waitForTimeout(100)

    const passAssertions = reportedAssertions.filter(
      (a) => (a as Record<string, unknown>).type === 'pass'
    )
    const failAssertions = reportedAssertions.filter(
      (a) => (a as Record<string, unknown>).type === 'fail'
    )

    // All pass() calls should have result=true (condition was truthy)
    for (const a of passAssertions) {
      expect((a as Record<string, unknown>).result).toBe(true)
    }

    // fail() calls report when condition is truthy (failure detected)
    // On initial load, there should be no failures
    expect(failAssertions.length).toBe(0)
  })
})

test.describe('Vite plugin dev panel', () => {
  test('dev panel is injected in development mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')

    // The dev panel should be present in the DOM
    const devPanel = page.locator('#scenetest-panel')
    await expect(devPanel).toBeVisible()
  })

  test('dev panel shows assertion count', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')
    await page.waitForTimeout(200)

    // The dev panel should show pass/fail counts
    const devPanel = page.locator('#scenetest-panel')
    const panelText = await devPanel.textContent()

    // Should contain some indication of assertions (e.g., "3 ✓")
    expect(panelText).toMatch(/\d+\s*✓/)
  })
})

test.describe('assertion timing and batching', () => {
  test('multiple rapid assertions are collected', async ({ page }) => {
    const reportedAssertions: unknown[] = []

    await page.exposeFunction('__scenetest_report', (result: unknown) => {
      reportedAssertions.push(result)
    })

    await page.goto('/')
    await page.waitForSelector('[data-testid="display-name"]')

    // Trigger form submission (fires many assertions rapidly)
    await page.locator('[data-testid="name-input"]').clear()
    await page.locator('[data-testid="name-input"]').fill('Batch Test')
    await page.locator('[data-testid="submit-button"]').click()
    await page.waitForSelector('[data-testid="success"]')

    // Wait for "settled" assertions (run after 100ms delay in app)
    await page.waitForTimeout(200)

    // Should have collected many assertions
    expect(reportedAssertions.length).toBeGreaterThan(10)
  })
})
