import { test, expect } from 'playwright-scenetest'

test.describe('Profile Form - Multi-Context Assertions', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test to start fresh
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  /**
   * This test demonstrates the core value of Scenetest:
   * The inline assertions in App.tsx automatically compare data across
   * DOM, component state, React Query cache, and localStorage.
   *
   * We just drive the user interaction - the assertions run automatically!
   */
  test('updating profile syncs data across all contexts', async ({ scenePage }) => {
    await scenePage.goto('/')

    // Wait for profile to load
    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('Test User')

    // Update name and email
    await nameInput.fill('Jane Doe')
    await scenePage.getByTestId('email-input').fill('jane@example.com')
    await scenePage.getByTestId('submit-button').click()

    // Wait for success
    await expect(scenePage.getByTestId('success')).toBeVisible()

    // The display should update to show new values
    await expect(scenePage.getByTestId('display-name')).toHaveText('Jane Doe')
    await expect(scenePage.getByTestId('display-email')).toHaveText('jane@example.com')

    // Wait for multi-context assertions to fire (they run after rAF)
    await scenePage.waitForTimeout(100)

    // Log what assertions we collected
    console.log(`\nCollected ${scenePage.assertions.length} inline assertions:`)
    console.log(`  - Passed: ${scenePage.passed.length}`)
    console.log(`  - Failed: ${scenePage.failed.length}`)

    // Check we got the multi-context assertions
    const multiContextAssertions = scenePage.assertions.filter((a) =>
      a.description.includes('matches saved value') || a.description.includes('All contexts')
    )
    console.log(`  - Multi-context assertions: ${multiContextAssertions.length}`)

    // All assertions should pass (data synced correctly across all contexts)
    expect(
      scenePage.failed,
      `Inline assertion failures:\n${formatFailures(scenePage.failed)}`
    ).toHaveLength(0)

    // Verify specific multi-context assertions ran
    expect(scenePage.assertions.find((a) => a.description === 'DOM name matches saved value')).toBeTruthy()
    expect(scenePage.assertions.find((a) => a.description === 'Cache name matches saved value')).toBeTruthy()
    expect(scenePage.assertions.find((a) => a.description === 'DB name matches saved value')).toBeTruthy()
    expect(scenePage.assertions.find((a) => a.description === 'All contexts have matching name')).toBeTruthy()
  })

  test('validation error does not corrupt state', async ({ scenePage }) => {
    await scenePage.goto('/')

    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible()

    // Try to submit with invalid name
    await nameInput.fill('X')
    await scenePage.getByTestId('submit-button').click()

    // Should show validation error
    await expect(scenePage.getByTestId('error')).toBeVisible()
    await expect(scenePage.getByTestId('error')).toContainText('at least 2 characters')

    // The original display values should be unchanged
    await expect(scenePage.getByTestId('display-name')).toHaveText('Test User')

    // The fail assertion for validation should have fired
    const validationFailed = scenePage.assertions.find(
      (a) => a.description === 'Form validation failed'
    )
    expect(validationFailed).toBeTruthy()
  })

  test('multiple updates maintain sync', async ({ scenePage }) => {
    await scenePage.goto('/')

    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible()

    // First update
    await nameInput.fill('First Update')
    await scenePage.getByTestId('submit-button').click()
    await expect(scenePage.getByTestId('success')).toBeVisible()
    await expect(scenePage.getByTestId('display-name')).toHaveText('First Update')

    // Second update
    await nameInput.fill('Second Update')
    await scenePage.getByTestId('submit-button').click()
    await expect(scenePage.getByTestId('display-name')).toHaveText('Second Update')

    // Wait for multi-context assertions to fire
    await scenePage.waitForTimeout(100)

    // Should have multiple sets of multi-context assertions
    const allContextsAssertions = scenePage.assertions.filter(
      (a) => a.description === 'All contexts have matching name'
    )
    expect(allContextsAssertions.length).toBeGreaterThanOrEqual(2)

    // All should pass
    expect(
      scenePage.failed,
      `Inline assertion failures:\n${formatFailures(scenePage.failed)}`
    ).toHaveLength(0)
  })
})

function formatFailures(failures: Array<{ description: string; stack?: string }>) {
  return failures.map((f) => `  - ${f.description}\n    ${f.stack?.split('\n')[0] ?? ''}`).join('\n')
}
