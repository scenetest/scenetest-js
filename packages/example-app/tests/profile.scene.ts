import { test, expect } from 'playwright-scenetest'

test.describe('Profile Form', () => {
  /**
   * This is how you'd actually write a Scene - just test the app!
   * The inline assertions in your components run automatically.
   * If any fail, the test fails.
   */
  test('user can update their profile', async ({ scenePage }) => {
    await scenePage.goto('/')

    // Wait for the form to load
    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('Test User')

    // Update the name
    await nameInput.fill('Updated Name')
    await scenePage.getByTestId('submit-button').click()

    // Verify success
    await expect(scenePage.getByTestId('success')).toBeVisible()

    // Assert no inline assertions failed
    // This is the key line - if any pass() or fail() in your components
    // detected a problem, the test fails here
    expect(scenePage.failed, `Inline assertion failures:\n${formatFailures(scenePage.failed)}`).toHaveLength(0)
  })

  test('shows validation error for short name', async ({ scenePage }) => {
    await scenePage.goto('/')

    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible()

    // Try to submit with a name that's too short
    await nameInput.fill('A')
    await scenePage.getByTestId('submit-button').click()

    // Should show error
    await expect(scenePage.getByTestId('error')).toBeVisible()
    await expect(scenePage.getByTestId('error')).toContainText('at least 2 characters')

    // Note: The fail('Form validation failed', true) in App.tsx will fire here,
    // but that's expected - it's detecting that validation failed, which is
    // correct behavior for this test case. So we don't assert on scenePage.failed.
  })
})

function formatFailures(failures: Array<{ description: string; stack?: string }>) {
  return failures.map(f => `  - ${f.description}\n    ${f.stack?.split('\n')[0] ?? ''}`).join('\n')
}
