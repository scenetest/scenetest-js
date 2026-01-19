import type { AssertionResult, AssertionConfig } from './types.js'

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
 * Parse file location from stack trace
 */
function parseLocation(stack: string | undefined): AssertionResult['location'] {
  if (!stack) return undefined

  // Match patterns like:
  // "at Component (http://localhost:5173/src/App.tsx:42:7)"
  // "at http://localhost:5173/src/App.tsx:42:7"
  const match = stack.match(/(?:at\s+)?(?:\S+\s+\()?(?:https?:\/\/[^/]+)?([^:)]+):(\d+)(?::(\d+))?/)
  if (!match) return undefined

  return {
    file: match[1],
    line: parseInt(match[2], 10),
    column: match[3] ? parseInt(match[3], 10) : undefined,
  }
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
 *   // With context for debugging:
 *   pass('user has valid ID', !!user.id, { userId: user.id, userName: user.name })
 * }
 * ```
 */
export function pass(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const stack = getStack()
  report({
    type: 'pass',
    description,
    result: condition,
    timestamp: Date.now(),
    stack,
    context,
    location: parseLocation(stack),
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
 *   // With context for debugging:
 *   fail('user missing required fields', !user.email, { user })
 * }
 * ```
 */
export function fail(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const stack = getStack()
  report({
    type: 'fail',
    description,
    result: !condition, // fail() passes when condition is false
    timestamp: Date.now(),
    stack,
    context,
    location: parseLocation(stack),
  })
}

/**
 * Multi-context assertion that compares browser and server data.
 *
 * This function is a stub that gets transformed by vite-plugin-scenetest.
 * In dev mode, the Vite plugin:
 * 1. Extracts the assertFn to a server-side virtual module
 * 2. Replaces this call with __scenetest_rpc() from scenetest/runtime
 *
 * @example
 * ```tsx
 * assert({
 *   title: 'User profile matches database',
 *   appData: () => ({ userId: profile.id, name: profile.name }),
 *   assertFn: (server, fromApp) => {
 *     const dbUser = server.db.getUser(fromApp.userId)
 *     pass('name matches', fromApp.name === dbUser.name)
 *   },
 * })
 * ```
 */
export function assert<TAppData>(_config: AssertionConfig<TAppData>): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}
