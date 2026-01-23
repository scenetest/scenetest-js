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
  /**
   * Wait for all pending multi-context assertions to complete.
   * Use this after triggering actions that invoke assertion() calls.
   */
  waitForAssertions(options?: { timeout?: number }): Promise<void>
}

/**
 * Scenetest fixtures for Playwright
 */
export interface ScenetestFixtures {
  /**
   * A page with scenetest assertion collection enabled.
   * All inline assertions (should/failed) called in the browser will be collected here.
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
    // This will be called by should() and failed() in the app
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

    // Add waitForAssertions method
    ;(scenePage as any).waitForAssertions = async (options?: { timeout?: number }): Promise<void> => {
      const timeout = options?.timeout ?? 5000
      const startTime = Date.now()
      const pollInterval = 50

      while (Date.now() - startTime < timeout) {
        const pending = await page.evaluate(() => {
          return typeof window.__scenetest_pending === 'function'
            ? window.__scenetest_pending()
            : 0
        })

        if (pending === 0) {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      }

      // Check one more time after timeout
      const finalPending = await page.evaluate(() => {
        return typeof window.__scenetest_pending === 'function'
          ? window.__scenetest_pending()
          : 0
      })

      if (finalPending > 0) {
        throw new Error(`waitForAssertions timed out after ${timeout}ms with ${finalPending} pending assertions`)
      }
    }

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
