import type {
  AssertionResult,
  AssertServerFn,
  AssertDataFn,
  CheckContext,
  CheckCondition,
  LazyContext,
} from './types.js'

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
 * Validate that a file path is safe to use in URI schemes.
 * Rejects paths that could be used for protocol injection or directory traversal.
 * @internal Exported for testing purposes
 */
export function isValidFilePath(path: string): boolean {
  // Reject paths with embedded protocols (e.g., "javascript:", "data:", "vscode://")
  if (path.includes('://')) {
    return false
  }
  // Reject paths with directory traversal sequences
  // Match ".." as a complete path segment (preceded/followed by / or \ or start/end of string)
  if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(path)) {
    return false
  }
  return true
}

/**
 * Get a simplified stack trace for debugging
 */
function getStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  // Skip the first 3 lines (Error, getStack, should/failed)
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

  const file = match[1]

  // Validate the file path before using it in URI schemes
  if (!isValidFilePath(file)) {
    return undefined
  }

  return {
    file,
    line: parseInt(match[2], 10),
    column: match[3] ? parseInt(match[3], 10) : undefined,
  }
}

/**
 * Normalize a thrown value into a readable string for context.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Resolve a possibly-lazy context into a plain object.
 *
 * If the context is a function it is invoked here so that expensive context
 * construction is deferred until the assertion actually runs. A throwing
 * context provider is reported rather than allowed to crash the caller.
 */
function resolveContext(context?: LazyContext): CheckContext | undefined {
  if (typeof context !== 'function') return context
  try {
    return context()
  } catch (err) {
    return { contextError: errorMessage(err) }
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
 * The `condition` may be a boolean, or a function returning a boolean. The
 * function form is evaluated lazily, so keep expensive computation inline with
 * the assertion instead of hoisting it into a variable that still runs after
 * the assertion is stripped from production:
 *
 * @example
 * ```tsx
 * function ProfileForm() {
 *   const profile = useProfile()
 *   should('profile should be loaded without pending state', profile !== undefined)
 *   // With context for debugging:
 *   should('user should have valid ID', !!user.id, { userId: user.id, userName: user.name })
 *
 *   // Lazy form — the computation only runs when the assertion runs, and the
 *   // whole call (computation included) is stripped from production builds:
 *   should('search returns results', () => expensiveSearch(query).length > 0)
 *
 *   // The predicate receives the resolved context:
 *   should('all items priced', (ctx) => ctx.items.every((i) => i.price > 0), { items })
 * }
 * ```
 */
export function should(description: string, condition: CheckCondition, context?: LazyContext): void {
  const stack = getStack()
  const resolvedContext = resolveContext(context)

  let result: boolean
  if (typeof condition === 'function') {
    try {
      result = !!condition(resolvedContext)
    } catch (err) {
      // A throwing predicate is a failed assertion, not a crashed component.
      report({
        type: 'fail',
        description,
        result: false,
        timestamp: Date.now(),
        stack,
        context: { ...resolvedContext, error: errorMessage(err) },
        location: parseLocation(stack),
      })
      return
    }
  } else {
    result = condition
  }

  report({
    type: result ? 'pass' : 'fail',
    description,
    result,
    timestamp: Date.now(),
    stack,
    context: resolvedContext,
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
 *
 * The `context` may be a function returning an object; it is only evaluated
 * when `failed()` runs, so expensive context construction can live with the
 * call and still strip cleanly from production builds.
 */
export function failed(description: string, context?: LazyContext): void {
  const stack = getStack()
  report({
    type: 'fail',
    description,
    result: false,
    timestamp: Date.now(),
    stack,
    context: resolveContext(context),
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
 * serverCheck(
 *   'User profile matches database',
 *   async (server, data) => {
 *     const dbUser = await server.db.getUser(data.userId)
 *     should('name should match', data.name === dbUser.name)
 *   },
 *   () => ({ userId: profile.id, name: profile.name })
 * )
 * ```
 */
export function serverCheck<TData>(
  _title: string,
  _serverFn: AssertServerFn<TData>,
  _withData?: AssertDataFn<TData>
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}
