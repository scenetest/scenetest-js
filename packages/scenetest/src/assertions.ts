import type { AssertionResult } from './types.js'

/**
 * Get a simplified stack trace for debugging
 */
function getStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  // Skip the first 3 lines (Error, getStack, pass/fail)
  const lines = stack.split('\n').slice(3)
  return lines.join('\n')
}

/**
 * Report an assertion result to the test runner (if available)
 */
function report(result: AssertionResult): void {
  if (typeof window !== 'undefined' && window.__scenetest_report) {
    window.__scenetest_report(result)
  }
}

/**
 * Inline assertion that passes when condition is true.
 *
 * Use this in your components to validate your mental model of how the code works.
 *
 * @example
 * ```tsx
 * function ProfileForm() {
 *   const profile = useProfile()
 *   pass('profile should be loaded without pending state', profile !== undefined)
 *   // ...
 * }
 * ```
 */
export function pass(description: string, condition: boolean): void {
  report({
    type: 'pass',
    description,
    result: condition,
    timestamp: Date.now(),
    stack: getStack(),
  })
}

/**
 * Inline assertion that fails when condition is true.
 *
 * Use this to assert that something should NOT happen.
 *
 * @example
 * ```tsx
 * function ProfileForm() {
 *   const profile = useProfile()
 *   fail('profile should not be in error state on mount', profile?.error)
 *   // ...
 * }
 * ```
 */
export function fail(description: string, condition: boolean): void {
  report({
    type: 'fail',
    description,
    result: !condition, // fail() passes when condition is false
    timestamp: Date.now(),
    stack: getStack(),
  })
}
