import type { Page, Locator } from 'playwright'
import type { Selector } from './types.js'

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
 * Resolve a simple selector (single part) to a locator.
 *
 * Resolution order (combined via CSS selector):
 * 1. data-testid
 * 2. id attribute
 * 3. aria-label (encourages accessibility)
 * 4. name attribute
 * 5. data-name attribute
 */
function resolveSimpleSelector(base: Page | Locator, name: string): Locator {
  // Check if it's an alias first (aliases start with ~)
  if (name.startsWith('~')) {
    const aliasName = name.slice(1)
    const aliasValue = globalAliases[aliasName]
    if (!aliasValue) {
      throw new Error(`Unknown alias: ${aliasName}`)
    }
    // Alias value is a CSS selector
    return base.locator(aliasValue)
  }

  // Check if it's explicitly an aria-label (starts with @)
  if (name.startsWith('@')) {
    const label = name.slice(1)
    return base.locator(`[aria-label="${label}"]`)
  }

  // Default resolution: try multiple strategies with first match
  // We use a CSS selector that matches any of these attributes
  const selector = [
    `[data-testid="${name}"]`,
    `[id="${name}"]`,
    `[aria-label="${name}"]`,
    `[name="${name}"]`,
    `[data-name="${name}"]`,
  ].join(', ')

  return base.locator(selector).first()
}

/**
 * Resolve a selector with an optional key (for lists).
 * The key matches against data-key attribute.
 *
 * @example
 * ```ts
 * // Find element with name="playlist-row" AND data-key="12345"
 * resolveWithKey(page, 'playlist-row', '12345')
 * ```
 */
function resolveWithKey(base: Page | Locator, name: string, key: string): Locator {
  // Build selector that matches name AND key
  const nameSelectors = [
    `[data-testid="${name}"]`,
    `[id="${name}"]`,
    `[aria-label="${name}"]`,
    `[name="${name}"]`,
    `[data-name="${name}"]`,
  ]

  // Combine with key requirement
  const selectors = nameSelectors.map((s) => `${s}[data-key="${key}"]`)
  const selector = selectors.join(', ')

  return base.locator(selector).first()
}

/**
 * Resolve a selector that may be nested (space-separated parts).
 *
 * @example
 * ```ts
 * // Simple
 * resolveSelector(page, 'button')
 *
 * // Nested
 * resolveSelector(page, 'modal form submit-button')
 *
 * // With tuple for key
 * resolveSelector(page, ['playlist-row', '12345'])
 *
 * // Nested ending with key
 * resolveSelector(page, ['list playlist-row', '12345'])
 * ```
 */
export function resolveSelector(base: Page | Locator, selector: Selector): Locator {
  // Handle tuple selector
  if (Array.isArray(selector)) {
    const [nameOrPath, key] = selector
    const parts = nameOrPath.trim().split(/\s+/)

    if (parts.length === 1) {
      // Simple name + key
      return resolveWithKey(base, parts[0], key)
    }

    // Nested path: resolve all but last as normal, then last with key
    let locator: Locator = resolveSimpleSelector(base, parts[0])
    for (let i = 1; i < parts.length - 1; i++) {
      locator = resolveSimpleSelector(locator, parts[i])
    }
    return resolveWithKey(locator, parts[parts.length - 1], key)
  }

  // Handle string selector
  const parts = selector.trim().split(/\s+/)
  let locator: Locator = resolveSimpleSelector(base, parts[0])

  for (let i = 1; i < parts.length; i++) {
    locator = resolveSimpleSelector(locator, parts[i])
  }

  return locator
}

/**
 * Get debugging info about what a selector would match.
 * Useful for the debug selector explorer.
 */
export async function explainSelector(
  page: Page,
  selector: Selector
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
    const selectorStr = Array.isArray(selector) ? selector[0] : selector

    // Look for similar elements
    const similarByTestId = await page.locator(`[data-testid*="${selectorStr}"]`).all()
    for (const el of similarByTestId.slice(0, 3)) {
      const testid = await el.getAttribute('data-testid')
      if (testid) suggestions.push(testid)
    }

    const similarByName = await page.locator(`[data-name*="${selectorStr}"]`).all()
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
