import type { AssertionResult, AssertionConfig } from './types.js'

/**
 * Compare pairs of values for equality.
 * Returns true if all pairs match (using strict equality).
 *
 * Useful for asserting multiple fields match in a single should() call.
 *
 * @example
 * ```tsx
 * should('primary fields should match', match(
 *   [localDeck.cards, dbDeck.cards],
 *   [localDeck.updated_at, dbDeck.updated_at]
 * ))
 * ```
 */
export function match(...pairs: [unknown, unknown][]): boolean {
  return pairs.every(([a, b]) => a === b)
}

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
 * Inline assertion that describes what should be true.
 *
 * Use this in your components to validate your mental model of how the code works.
 * The description should read as a natural "should" statement.
 *
 * @example
 * ```tsx
 * function ProfileForm() {
 *   const profile = useProfile()
 *   should('profile should be loaded without pending state', profile !== undefined)
 *   // With context for debugging:
 *   should('user should have valid ID', !!user.id, { userId: user.id, userName: user.name })
 * }
 * ```
 */
export function should(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const stack = getStack()
  report({
    type: condition ? 'pass' : 'fail',
    description,
    result: condition,
    timestamp: Date.now(),
    stack,
    context,
    location: parseLocation(stack),
  })
}

/**
 * Past-tense failure marker for unexpected code paths.
 *
 * Use this to report that something bad already happened.
 * Think of it like a `console.error("something weird happened")` that gets tracked.
 *
 * @example
 * ```tsx
 * function ProfileForm() {
 *   if (name.trim().length < 2) {
 *     failed('form submitted with name too short', { name })
 *     return
 *   }
 *
 *   mutation.mutate(data, {
 *     onError: (err) => {
 *       failed('mutation failed unexpectedly', { error: err.message })
 *     }
 *   })
 * }
 * ```
 */
export function failed(description: string, context?: Record<string, unknown>): void {
  const stack = getStack()
  report({
    type: 'fail',
    description,
    result: false,
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
 * 1. Extracts the serverFn to a server-side virtual module
 * 2. Replaces this call with __scenetest_rpc() from scenetest/runtime
 *
 * @example
 * ```tsx
 * assert({
 *   title: 'User profile matches database',
 *   withData: () => ({ userId: profile.id, name: profile.name }),
 *   serverFn: (server, data) => {
 *     const dbUser = server.db.getUser(data.userId)
 *     should('name should match', data.name === dbUser.name)
 *   },
 * })
 * ```
 */
export function assert<TData>(_config: AssertionConfig<TData>): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}
