import type { ConsoleError } from './types.js'

/**
 * Console-error expectation matching.
 *
 * Browser console errors and uncaught exceptions are captured per scene (see
 * `team-manager.ts`). Most of the time an error is a problem, but sometimes a
 * scene *wants* one — "log in with the wrong password" should make the server
 * return a 400, and it would be a bug if it didn't. `expectConsoleError()` lets
 * a scene claim such an error: the matched entry is marked `expected`, so the
 * reporter counts it as a success instead of surfacing it as a problem.
 */

/**
 * Does a captured console-error message satisfy the expectation pattern?
 * Strings match as case-insensitive substrings (forgiving for hand-written
 * specs); RegExps are tested as given.
 */
export function consoleErrorMatches(message: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string'
    ? message.toLowerCase().includes(pattern.toLowerCase())
    : pattern.test(message)
}

/**
 * Claim the earliest still-unclaimed console error produced by `actor` that
 * matches `pattern`, marking it `expected` so the reporter treats it as a
 * success rather than a problem. Returns the claimed error, or `null` when none
 * match. "First match only": one call claims at most one error.
 */
export function claimConsoleError(
  errors: readonly ConsoleError[],
  actor: string,
  pattern: string | RegExp
): ConsoleError | null {
  let earliest: ConsoleError | null = null
  for (const e of errors) {
    if (e.expected) continue
    if (e.actor !== actor) continue
    if (!consoleErrorMatches(e.message, pattern)) continue
    if (!earliest || e.timestamp < earliest.timestamp) earliest = e
  }
  if (earliest) earliest.expected = true
  return earliest
}

/**
 * Poll the shared console-error buffer until an error matching `pattern`
 * appears for `actor`, claiming it. The triggering action (a click that hits a
 * failing endpoint, say) usually lands the error a beat after it resolves, so
 * we wait up to `timeout`. Resolves the claimed error, or `null` if none
 * arrived in time.
 */
export async function waitForConsoleError(
  errors: readonly ConsoleError[],
  actor: string,
  pattern: string | RegExp,
  timeout: number,
  pollInterval = 50
): Promise<ConsoleError | null> {
  const deadline = Date.now() + timeout
  for (;;) {
    const claimed = claimConsoleError(errors, actor, pattern)
    if (claimed) return claimed
    if (Date.now() >= deadline) return null
    await new Promise((r) => setTimeout(r, pollInterval))
  }
}

/**
 * Parse a text-DSL / `.spec.md` `expectConsoleError` argument. A
 * `/pattern/flags` form becomes a RegExp; anything else is a literal
 * (case-insensitive) substring.
 */
export function parseConsoleErrorPattern(text: string): string | RegExp {
  const m = text.match(/^\/(.*)\/([a-z]*)$/)
  if (m) {
    try {
      return new RegExp(m[1], m[2])
    } catch {
      // Not a valid RegExp — fall back to literal substring matching.
    }
  }
  return text
}

/**
 * Build the error thrown when an expected console error never arrives. Lists
 * the unclaimed errors actually seen for the actor, so the mismatch is obvious.
 */
export function describeMissingConsoleError(
  errors: readonly ConsoleError[],
  actor: string,
  pattern: string | RegExp,
  timeout: number
): string {
  const patternStr = typeof pattern === 'string' ? `"${pattern}"` : String(pattern)
  const seen = errors
    .filter((e) => e.actor === actor && !e.expected)
    .map((e) => `  - ${e.message}`)
  const tail = seen.length
    ? `\nUnclaimed console errors seen for [${actor}]:\n${seen.join('\n')}`
    : `\nNo unclaimed console errors were captured for [${actor}].`
  return `expectConsoleError: no console error matching ${patternStr} appeared within ${timeout}ms.${tail}`
}
