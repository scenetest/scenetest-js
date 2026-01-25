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

  // Default: try all attribute types
  return base.locator(buildTokenSelector(token)).first()
}

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

    // Check if current element has data-key matching the next token
    // This allows 'playlist-row 12345' to match a single element with both attributes
    const withKey = locator.filter({ has: base.locator(`[data-key="${nextToken}"]`) })

    // We need to check if the current locator itself has the data-key
    // Use a more direct approach: check if locator[data-key=nextToken] exists
    const sameElementWithKey = locator.locator(`xpath=self::*[@data-key="${nextToken}"]`)

    // Try to resolve: does the current element have this data-key?
    // We'll build a locator that checks, and use it in the chain
    // Since we can't do async checks here, we use a filter approach

    // Actually, let's use a simpler approach:
    // Build a locator that tries both interpretations and takes the first match
    // But that's complex. Let's just always check for key on same element first.

    // Simpler: use locator chaining with 'or'
    // Option 1: Same element has data-key=nextToken (consume token, stay on element)
    // Option 2: Child matches nextToken (descend)

    // We'll prioritize: if current element has data-key matching next token,
    // treat it as a key match and skip to the token after
    // This is done by checking self::*[@data-key=...]

    // For now, use a practical approach: try to find child, but also support
    // the key-on-same-element pattern by including data-key in the resolution

    // Actually the cleanest way: always descend, but data-key IS in the attribute list
    // So 'playlist-row 12345' will:
    // 1. Find playlist-row (matches data-name or similar)
    // 2. Look for '12345' in children - but wait, it might be on same element!

    // The user's algorithm says: after matching token1, check if THAT SAME ELEMENT
    // has data-key=token2. If yes, stay on same element and consume token2.

    // We need to do this check. Let's restructure:

    // Check if current locator's element has data-key = nextToken
    // We can do this with a self:: xpath or by checking the attribute

    // Build combined locator:
    // Either: current element has data-key=nextToken (stay, consume)
    // Or: find child matching nextToken (descend)

    // Use Playwright's .or() to combine
    const stayOnCurrent = locator.locator(`xpath=self::*[@data-key="${nextToken}"]`)
    const descendToChild = locator.locator(buildTokenSelector(nextToken)).first()

    // Prefer staying on current if it has the key, otherwise descend
    locator = stayOnCurrent.or(descendToChild).first()
    i++
  }

  return locator
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
