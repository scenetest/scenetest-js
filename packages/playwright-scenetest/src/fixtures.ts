import { test as base, type Page } from '@playwright/test'
import type { AssertionResult } from 'scenetest'

/**
 * Extended page with scenetest assertion collection
 */
export interface ScenePage extends Page {
  /** All assertions collected during this test */
  readonly assertions: AssertionResult[]
  /** Assertions that passed */
  readonly passed: AssertionResult[]
  /** Assertions that failed */
  readonly failed: AssertionResult[]
}

/**
 * Scenetest fixtures for Playwright
 */
export interface ScenetestFixtures {
  /**
   * A page with scenetest assertion collection enabled.
   * All inline assertions (pass/fail) called in the browser will be collected here.
   */
  scenePage: ScenePage
}

/**
 * Extended Playwright test with scenetest fixtures
 */
export const test = base.extend<ScenetestFixtures>({
  scenePage: async ({ page }, use) => {
    const assertions: AssertionResult[] = []

    // Expose the report function to the browser
    // This will be called by pass() and fail() in the app
    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      assertions.push(result)
    })

    // Create the extended page object
    const scenePage = page as ScenePage

    // Add getters for assertions
    Object.defineProperty(scenePage, 'assertions', {
      get: () => assertions,
    })

    Object.defineProperty(scenePage, 'passed', {
      get: () => assertions.filter((a) => a.result === true),
    })

    Object.defineProperty(scenePage, 'failed', {
      get: () => assertions.filter((a) => a.result === false),
    })

    await use(scenePage)

    // After the test, log any failed assertions
    const failures = assertions.filter((a) => a.result === false)
    if (failures.length > 0) {
      console.log('\n--- Scenetest Inline Assertion Failures ---')
      for (const failure of failures) {
        console.log(`  [${failure.type}] ${failure.description}`)
        if (failure.stack) {
          console.log(`    at ${failure.stack.split('\n')[0]}`)
        }
      }
      console.log('-------------------------------------------\n')
    }
  },
})

export { expect } from '@playwright/test'
