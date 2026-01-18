import { test, expect } from 'playwright-scenetest'

test.describe('Profile Form Scene', () => {
  test('User views and updates their profile', async ({ scenePage }) => {
    // Navigate to the app
    await scenePage.goto('/')

    // Wait for the form to be ready (profile loads in 100ms, might miss loading state)
    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await expect(nameInput).toHaveValue('Test User')

    const emailInput = scenePage.getByTestId('email-input')
    await expect(emailInput).toHaveValue('test@example.com')

    // Update the name
    await nameInput.fill('Updated Name')
    await scenePage.getByTestId('submit-button').click()

    // Verify success message
    await expect(scenePage.getByTestId('success')).toBeVisible()

    // Check inline assertions were collected
    console.log(`\nCollected ${scenePage.assertions.length} inline assertions:`)
    console.log(`  - Passed: ${scenePage.passed.length}`)
    console.log(`  - Failed: ${scenePage.failed.length}`)

    // Verify we collected assertions
    expect(scenePage.assertions.length).toBeGreaterThan(0)

    // Verify specific assertions ran
    const profileRendered = scenePage.assertions.find(
      (a) => a.description === 'ProfileForm rendered successfully'
    )
    expect(profileRendered).toBeTruthy()
    expect(profileRendered?.result).toBe(true)

    const profileLoaded = scenePage.assertions.find(
      (a) => a.description === 'Profile loaded with name'
    )
    expect(profileLoaded).toBeTruthy()
    expect(profileLoaded?.result).toBe(true)

    const formSubmitted = scenePage.assertions.find(
      (a) => a.description === 'Form submitted successfully'
    )
    expect(formSubmitted).toBeTruthy()
    expect(formSubmitted?.result).toBe(true)

    // All assertions should have passed
    expect(scenePage.failed.length).toBe(0)
  })

  test('Form validation triggers fail assertion', async ({ scenePage }) => {
    await scenePage.goto('/')

    // Wait for the form to be ready
    const nameInput = scenePage.getByTestId('name-input')
    await expect(nameInput).toBeVisible({ timeout: 10000 })

    // Clear the name and submit (should fail validation)
    await nameInput.fill('A')
    await scenePage.getByTestId('submit-button').click()

    // Error should be visible
    await expect(scenePage.getByTestId('error')).toBeVisible()

    // Check that the validation failure assertion was recorded
    const validationFailed = scenePage.assertions.find(
      (a) => a.description === 'Form validation failed'
    )
    expect(validationFailed).toBeTruthy()

    // This assertion passes (the fail() function was called with true)
    // but it indicates a failure condition was detected
    console.log('\nValidation failure detected by inline assertion')
  })
})
