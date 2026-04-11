import type { Page, Locator } from 'playwright'

/**
 * Selector alias configuration
 */
export type SelectorAliases = Record<string, string>

/**
 * Global alias registry
 */
let globalAliases: SelectorAliases = {}

/**
 * Set the global selector aliases
 */
export function setAliases(aliases: SelectorAliases): void {
  globalAliases = aliases
}

/**
 * Get the current aliases
 */
export function getAliases(): SelectorAliases {
  return globalAliases
}

/**
 * Clear all aliases
 */
export function clearAliases(): void {
  globalAliases = {}
}

/**
 * Build CSS selector for a single token.
 *
 * Resolution order:
 * 1. aria-label - Accessibility label (encouraged for interactive elements)
 * 2. id - DOM id attribute
 * 3. data-testid - Explicit test identifier
 * 4. data-name - Custom name attribute
 * 5. data-key - Key for list items
 * 6. name - Form element name
 */
function buildTokenSelector(token: string): string {
  return [
    `[aria-label="${token}"]`,
    `[id="${token}"]`,
    `[data-testid="${token}"]`,
    `[data-name="${token}"]`,
    `[data-key="${token}"]`,
    `[name="${token}"]`,
  ].join(', ')
}

/**
 * Resolve a single token to a locator.
 * Handles aliases (~) and explicit aria-labels (@).
 */
function resolveToken(base: Page | Locator, token: string): Locator {
  // Check if it's an alias (starts with ~)
  if (token.startsWith('~')) {
    const aliasName = token.slice(1)
    const aliasValue = globalAliases[aliasName]
    if (!aliasValue) {
      throw new Error(`Unknown alias: ${aliasName}`)
    }
    return base.locator(aliasValue)
  }

  // Check if it's explicitly an aria-label (starts with @)
  if (token.startsWith('@')) {
    const label = token.slice(1)
    return base.locator(`[aria-label="${label}"]`)
  }

  // Default: try all attribute types (no .first() — callers narrow further)
  return base.locator(buildTokenSelector(token))
}

/**
 * Match a `#N` nth-element token (1-based index).
 * Returns the parsed index (1-based) or null if the token doesn't match.
 */
const NTH_RE = /^#(\d+)$/

/**
 * Resolve a space-separated selector string.
 *
 * Algorithm:
 * 1. Split into tokens
 * 2. For each token, find matching element
 * 3. After matching, check if SAME element has data-key matching NEXT token
 *    - If yes: consume that token (it's a key match), continue with token after
 *    - If no: descend into children for next token
 *
 * Special token `#N` (e.g. `#1`, `#3`) narrows the current locator to the
 * Nth match (1-based).  This avoids brittle selectors that hardcode dynamic
 * values like UUIDs from seed data.
 *
 * @example
 * ```ts
 * // Simple
 * resolveSelector(page, 'button')
 *
 * // Nested
 * resolveSelector(page, 'modal form submit-button')
 *
 * // With implicit key matching
 * resolveSelector(page, 'playlist-row 12345 like-button')
 * // Finds playlist-row, checks if it has data-key="12345",
 * // if yes stays on same element, then finds like-button child
 *
 * // Nth element — click the first feed-phrase-link
 * resolveSelector(page, 'feed-phrase-link #1')
 *
 * // Nth element with nesting — click delete in the 2nd row
 * resolveSelector(page, 'table-row #2 delete-button')
 * ```
 */
export function resolveSelector(base: Page | Locator, selector: string): Locator {
  const tokens = selector.trim().split(/\s+/)

  if (tokens.length === 0) {
    throw new Error('Empty selector')
  }

  let locator: Locator = resolveToken(base, tokens[0])
  let i = 1

  while (i < tokens.length) {
    const nextToken = tokens[i]

    // Nth-element narrowing: #1, #2, etc. (1-based)
    const nthMatch = NTH_RE.exec(nextToken)
    if (nthMatch) {
      const n = parseInt(nthMatch[1], 10)
      if (n < 1) {
        throw new Error(`#N index must be >= 1, got #${n}`)
      }
      locator = locator.nth(n - 1)
      i++
      continue
    }

    // Same-element match: current element has data-key=nextToken (stay on it)
    const sameElement = locator.locator(`xpath=self::*[@data-key="${nextToken}"]`)
    // Descendant match: find child/descendant matching nextToken (descend)
    const descendant = locator.locator(buildTokenSelector(nextToken))

    // No .first() here — keep all candidates so subsequent tokens can narrow further
    locator = sameElement.or(descendant)
    i++
  }

  return locator
}

/**
 * Resolve a selector with scope fallback.
 *
 * Tries to resolve within the given scope first.  If the scope is not the
 * page root and no matches are found, retries from the page root.  When the
 * fallback succeeds a warning is logged so spec authors know the element
 * was found outside the expected scope.
 *
 * @param scope   Current scope (Page or Locator)
 * @param page    The Page root (used as fallback)
 * @param selector  Selector string
 * @param context   Human-readable action description for the warning (e.g. "click(submit)")
 * @param timeout   When provided, waits for the element to become visible in
 *                  either scope or page root (using locator.or()) instead of a
 *                  point-in-time count() check.  This prevents race conditions
 *                  where the element hasn't appeared yet when resolution runs.
 */
export async function resolveSelectorWithFallback(
  scope: Page | Locator,
  page: Page,
  selector: string,
  context?: string,
  timeout?: number
): Promise<Locator> {
  // If scope is already the page, no fallback needed
  if (scope === page) {
    return resolveSelector(page, selector)
  }

  const scopedLocator = resolveSelector(scope, selector)
  const rootLocator = resolveSelector(page, selector)

  if (timeout != null) {
    // Wait for the element to appear in either scope or page root.
    // This avoids the race where a point-in-time count() returns 0 for both,
    // causing the wrong locator to be returned and a subsequent waitFor to
    // look in the wrong subtree.
    const combined = scopedLocator.or(rootLocator)
    await combined.waitFor({ state: 'visible', timeout })

    // Prefer the scoped locator when the element is within scope
    if (await scopedLocator.isVisible()) {
      return scopedLocator
    }

    if (context) {
      console.warn(`⚠ ${context} — not found in current scope, resolved from page root`)
    }
    return rootLocator
  }

  // Point-in-time fallback (for callers that don't need to wait, e.g. ifClick)
  const count = await scopedLocator.count()
  if (count > 0) {
    return scopedLocator
  }

  const rootCount = await rootLocator.count()
  if (rootCount > 0) {
    if (context) {
      console.warn(`⚠ ${context} — not found in current scope, resolved from page root`)
    }
    return rootLocator
  }

  // Not found anywhere — return the scoped locator so the caller gets
  // the normal Playwright timeout error with the original scope context
  return scopedLocator
}

/**
 * Get debugging info about what a selector would match.
 * Useful for the debug selector explorer.
 */
export async function explainSelector(
  page: Page,
  selector: string
): Promise<{
  found: boolean
  count: number
  matches: Array<{
    tag: string
    attributes: Record<string, string>
    text: string
  }>
  suggestions: string[]
}> {
  const locator = resolveSelector(page, selector)
  const count = await locator.count()
  const matches: Array<{ tag: string; attributes: Record<string, string>; text: string }> = []

  // Get info about matching elements
  for (let i = 0; i < Math.min(count, 5); i++) {
    const element = locator.nth(i)
    const tag = await element.evaluate((el) => el.tagName.toLowerCase())
    const text = (await element.textContent()) || ''
    const attributes: Record<string, string> = await element.evaluate((el) => {
      const attrs: Record<string, string> = {}
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value
      }
      return attrs
    })
    matches.push({ tag, attributes, text: text.slice(0, 100) })
  }

  // Generate suggestions if not found
  const suggestions: string[] = []
  if (count === 0) {
    const firstToken = selector.trim().split(/\s+/)[0]

    // Look for similar elements
    const similarByAriaLabel = await page.locator(`[aria-label*="${firstToken}"]`).all()
    for (const el of similarByAriaLabel.slice(0, 3)) {
      const label = await el.getAttribute('aria-label')
      if (label) suggestions.push(label)
    }

    const similarByTestId = await page.locator(`[data-testid*="${firstToken}"]`).all()
    for (const el of similarByTestId.slice(0, 3)) {
      const testid = await el.getAttribute('data-testid')
      if (testid) suggestions.push(testid)
    }

    const similarByName = await page.locator(`[data-name*="${firstToken}"]`).all()
    for (const el of similarByName.slice(0, 3)) {
      const name = await el.getAttribute('data-name')
      if (name) suggestions.push(name)
    }
  }

  return {
    found: count > 0,
    count,
    matches,
    suggestions: [...new Set(suggestions)],
  }
}
