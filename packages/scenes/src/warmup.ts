/**
 * Actor warmup — run login (or other setup) once per actor, on first use,
 * capture the resulting storageState, and reuse it for subsequent scenes.
 *
 * Warmup is lazy: nothing runs at startup. The first time a scene creates
 * a context for an actor with `warmup`, the cache runs the warmup and
 * stores the result. Same actor key in a later scene gets the cached state.
 */

import type { Browser, Page } from 'playwright'
import type { ActorConfig } from './types.js'
import { getMacro } from './dsl.js'
import { resolveSelector } from './selectors.js'

// ---------------------------------------------------------------------------
// StorageState — mirrors Playwright's shape
// ---------------------------------------------------------------------------

export interface StorageState {
  cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: 'Strict' | 'Lax' | 'None'
  }>
  origins: Array<{
    origin: string
    localStorage: Array<{ name: string; value: string }>
  }>
}

// ---------------------------------------------------------------------------
// WarmupCache — lazy, deduplicating cache
// ---------------------------------------------------------------------------

/**
 * Lazy warmup cache. Runs each actor's warmup at most once (keyed by
 * actor `key`), on the first scene that needs it.
 *
 * Concurrent requests for the same key share the same in-flight promise,
 * so parallel scenes never double-warmup.
 */
export class WarmupCache {
  private cache = new Map<string, Promise<StorageState>>()

  /**
   * Get cached warmup state for an actor, running warmup on first request.
   * Returns `undefined` if the actor has no warmup configured.
   */
  async ensure(
    browser: Browser,
    config: ActorConfig,
    baseUrl: string,
    actionTimeout: number
  ): Promise<StorageState | undefined> {
    if (!config.warmup) return undefined

    const existing = this.cache.get(config.key)
    if (existing) return existing

    const start = Date.now()
    const promise = runActorWarmup(browser, config, baseUrl, actionTimeout)
      .then(state => {
        console.log(`    ✓ warmup: ${config.key} (${Date.now() - start}ms)`)
        return state
      })
      .catch(err => {
        // Remove failed entry so it can be retried
        this.cache.delete(config.key)
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`    ✗ warmup failed: ${config.key} — ${msg}`)
        throw err
      })

    this.cache.set(config.key, promise)
    return promise
  }

  /** Number of cached warmup states (for testing). */
  get size(): number {
    return this.cache.size
  }
}

// ---------------------------------------------------------------------------
// executeMacroOnPage — lightweight imperative executor
// ---------------------------------------------------------------------------

/**
 * Interpolate `[self.field]` references in a DSL line with actor config values.
 */
function interpolateSelf(line: string, config: ActorConfig): string {
  return line.replace(
    /\[self\.([\w]+)\]/g,
    (_match, field: string) => {
      const value = config[field]
      if (value === undefined) {
        throw new Error(`[self.${field}] — actor "${config.key}" has no field "${field}"`)
      }
      return String(value)
    }
  )
}

/**
 * Execute a sequence of DSL action lines on a bare Playwright page.
 *
 * Supports the subset of actions needed for login flows:
 * openTo, see, seeText, click, typeInto, wait.
 *
 * Interpolates `[self.field]` for actor credentials.
 */
export async function executeMacroOnPage(
  page: Page,
  actions: string[],
  config: ActorConfig,
  actionTimeout: number
): Promise<void> {
  for (const raw of actions) {
    const line = interpolateSelf(raw, config).trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    const spaceIdx = line.indexOf(' ')
    const action = spaceIdx === -1 ? line : line.slice(0, spaceIdx)
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim()

    switch (action) {
      case 'openTo':
        await page.goto(rest, { timeout: actionTimeout })
        break

      case 'see': {
        const locator = resolveSelector(page, rest)
        await locator.waitFor({ state: 'visible', timeout: actionTimeout })
        break
      }

      case 'seeText':
        await page.getByText(rest).first().waitFor({ state: 'visible', timeout: actionTimeout })
        break

      case 'click': {
        const locator = resolveSelector(page, rest)
        await locator.click({ timeout: actionTimeout })
        break
      }

      case 'typeInto': {
        // Last token is value, everything before is selector
        const { selector, value } = extractSelectorAndValue(rest)
        await resolveSelector(page, selector).fill(value, { timeout: actionTimeout })
        break
      }

      case 'wait': {
        const ms = parseInt(rest, 10)
        if (isNaN(ms)) throw new Error(`warmup: wait requires a number, got: ${rest}`)
        await new Promise(r => setTimeout(r, ms))
        break
      }

      default:
        throw new Error(`warmup: unsupported action "${action}" — only openTo, see, seeText, click, typeInto, wait are supported`)
    }
  }
}

/**
 * Extract selector and value from a "selector value" string.
 * Last token (possibly quoted) is the value; everything before is the selector.
 */
function extractSelectorAndValue(rest: string): { selector: string; value: string } {
  const trimmed = rest.trim()

  // Check for quoted last token
  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar === "'" || lastChar === '"') {
    let i = trimmed.length - 2
    while (i >= 0 && trimmed[i] !== lastChar) i--
    if (i >= 0) {
      return {
        selector: trimmed.slice(0, i).trim(),
        value: trimmed.slice(i + 1, -1),
      }
    }
  }

  // No quotes — last word is the value
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) {
    throw new Error(`warmup typeInto: expected "selector value", got: ${rest}`)
  }
  return {
    selector: trimmed.slice(0, lastSpace).trim(),
    value: trimmed.slice(lastSpace + 1),
  }
}

// ---------------------------------------------------------------------------
// runActorWarmup — single actor
// ---------------------------------------------------------------------------

/**
 * Run warmup for a single actor: create temp context, execute warmup,
 * capture storageState, close context.
 */
export async function runActorWarmup(
  browser: Browser,
  config: ActorConfig,
  baseUrl: string,
  actionTimeout: number
): Promise<StorageState> {
  const context = await browser.newContext({
    baseURL: baseUrl,
  })

  try {
    const page = await context.newPage()

    if (typeof config.warmup === 'function') {
      // Function warmup
      await config.warmup(page, config)
    } else if (typeof config.warmup === 'string') {
      // Macro warmup
      const macro = getMacro(config.warmup)
      if (!macro) {
        throw new Error(
          `warmup: macro "${config.warmup}" not found for actor "${config.key}". ` +
          `Register it with defineMacro('${config.warmup}', [...]) before scenes run.`
        )
      }
      await executeMacroOnPage(page, macro, config, actionTimeout)
    } else {
      throw new Error(`warmup: actor "${config.key}" has invalid warmup type: ${typeof config.warmup}`)
    }

    // Capture storage state
    const state = await context.storageState() as StorageState
    return state
  } finally {
    await context.close()
  }
}
