/**
 * Result of an inline assertion, sent to the test runner
 */
export interface AssertionResult {
  type: 'pass' | 'fail'
  description: string
  result: boolean
  timestamp: number
  /** Stack trace to locate where the assertion was called */
  stack?: string
}

/**
 * The global reporter function exposed by Playwright fixtures
 */
export type ScenetestReporter = (result: AssertionResult) => void

declare global {
  interface Window {
    __scenetest_report?: ScenetestReporter
  }
}
