import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSelector, resolveSelectorWithFallback, setAliases, clearAliases } from '../selectors.js'

// ---------------------------------------------------------------------------
// Helpers — chainable Playwright locator mock
// ---------------------------------------------------------------------------

/**
 * Create a mock locator that records all chained calls.
 * Each method returns a new mock locator so the chain is traceable.
 */
function createMockLocator(label = 'root') {
  const calls: Array<{ method: string; args: unknown[]; on: string }> = []

  function makeMock(name: string): any {
    const mock: any = {
      _label: name,
      _calls: calls,
      locator: vi.fn((...args: unknown[]) => {
        calls.push({ method: 'locator', args, on: name })
        return makeMock(`${name}.locator(${args[0]})`)
      }),
      filter: vi.fn((...args: unknown[]) => {
        calls.push({ method: 'filter', args, on: name })
        return makeMock(`${name}.filter(...)`)
      }),
      first: vi.fn(() => {
        calls.push({ method: 'first', args: [], on: name })
        return makeMock(`${name}.first()`)
      }),
      or: vi.fn((...args: unknown[]) => {
        calls.push({ method: 'or', args, on: name })
        return makeMock(`${name}.or(...)`)
      }),
      nth: vi.fn((n: number) => {
        calls.push({ method: 'nth', args: [n], on: name })
        return makeMock(`${name}.nth(${n})`)
      }),
    }
    return mock
  }

  return { mock: makeMock(label), calls }
}

function createMockPage() {
  const { mock, calls } = createMockLocator('page')
  return { page: mock, calls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSelector', () => {
  beforeEach(() => {
    clearAliases()
  })

  describe('single-token selectors', () => {
    it('resolves a single token without calling .first()', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'submit-button')

      // Should call page.locator with the CSS selector
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('locator')
      expect(calls[0].args[0]).toContain('[aria-label="submit-button"]')

      // .first() should NOT be called
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('resolves alias token (~) without .first()', () => {
      setAliases({ nav: '.main-nav > ul' })
      const { page, calls } = createMockPage()

      resolveSelector(page, '~nav')

      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('locator')
      expect(calls[0].args[0]).toBe('.main-nav > ul')

      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('resolves aria-label token (@) without .first()', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, '@Submit')

      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('locator')
      expect(calls[0].args[0]).toBe('[aria-label="Submit"]')

      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('throws on unknown alias', () => {
      const { page } = createMockPage()
      expect(() => resolveSelector(page, '~unknown')).toThrow('Unknown alias: unknown')
    })

    it('whitespace-only selector resolves empty-string token', () => {
      // '  '.trim().split(/\s+/) produces [''], not [] — so it resolves an empty string token
      const { page, calls } = createMockPage()
      resolveSelector(page, '  ')
      expect(calls).toHaveLength(1)
      expect(calls[0].method).toBe('locator')
    })
  })

  describe('multi-token selectors — filter-then-pick', () => {
    it('two tokens: no .first() on intermediate step', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'sidebar-link review-link')

      // Step 1: page.locator(token1CSS)
      expect(calls[0]).toMatchObject({ method: 'locator', on: 'page' })

      // Step 2: sameElement = locator.locator(xpath self data-key)
      const xpathCall = calls.find(
        (c) => c.method === 'locator' && String(c.args[0]).includes('xpath=self')
      )
      expect(xpathCall).toBeTruthy()
      expect(String(xpathCall!.args[0])).toContain('data-key="review-link"')

      // Step 3: descendant = locator.locator(token2CSS)
      const descendantCall = calls.find(
        (c) =>
          c.method === 'locator' &&
          String(c.args[0]).includes('[aria-label="review-link"]') &&
          !String(c.args[0]).includes('xpath')
      )
      expect(descendantCall).toBeTruthy()

      // Step 4: sameElement.or(descendant)
      const orCall = calls.find((c) => c.method === 'or')
      expect(orCall).toBeTruthy()

      // NO .first() called anywhere in the chain
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('three tokens: no .first() on any intermediate step', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'modal form submit-button')

      // Should have calls for:
      // 1. page.locator(token1CSS)
      // 2. For token2: locator.locator(xpath), locator.locator(token2CSS), .or()
      // 3. For token3: locator.locator(xpath), locator.locator(token3CSS), .or()

      const orCalls = calls.filter((c) => c.method === 'or')
      expect(orCalls).toHaveLength(2)

      // NO .first() called anywhere
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('data-key same-element pattern: uses xpath self-match', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'playlist-row 12345 like-button')

      // For token "12345", should have xpath self::*[@data-key="12345"]
      const xpathCalls = calls.filter(
        (c) => c.method === 'locator' && String(c.args[0]).includes('xpath=self')
      )
      expect(xpathCalls).toHaveLength(2) // once for "12345", once for "like-button"

      expect(String(xpathCalls[0].args[0])).toContain('data-key="12345"')
      expect(String(xpathCalls[1].args[0])).toContain('data-key="like-button"')

      // NO .first() called anywhere
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('builds correct CSS selector with all attribute types', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'button')

      const selector = String(calls[0].args[0])
      expect(selector).toContain('[aria-label="button"]')
      expect(selector).toContain('[id="button"]')
      expect(selector).toContain('[data-testid="button"]')
      expect(selector).toContain('[data-name="button"]')
      expect(selector).toContain('[data-key="button"]')
      expect(selector).toContain('[name="button"]')
    })

    it('alias as first token in multi-token selector', () => {
      setAliases({ sidebar: '.sidebar-nav' })
      const { page, calls } = createMockPage()

      resolveSelector(page, '~sidebar link-item')

      // First call: page.locator('.sidebar-nav')
      expect(calls[0]).toMatchObject({ method: 'locator', args: ['.sidebar-nav'], on: 'page' })

      // Then the second token chains without .first()
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })
  })

  describe('#N nth-element narrowing', () => {
    it('#1 calls .nth(0) on the current locator', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'feed-phrase-link #1')

      // Step 1: page.locator(token1CSS)
      expect(calls[0]).toMatchObject({ method: 'locator', on: 'page' })
      expect(calls[0].args[0]).toContain('[aria-label="feed-phrase-link"]')

      // Step 2: .nth(0) — 1-based #1 maps to 0-based nth(0)
      const nthCalls = calls.filter((c) => c.method === 'nth')
      expect(nthCalls).toHaveLength(1)
      expect(nthCalls[0].args[0]).toBe(0)

      // No .first() or .or() calls
      expect(calls.filter((c) => c.method === 'first')).toHaveLength(0)
      expect(calls.filter((c) => c.method === 'or')).toHaveLength(0)
    })

    it('#3 calls .nth(2)', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'list-item #3')

      const nthCalls = calls.filter((c) => c.method === 'nth')
      expect(nthCalls).toHaveLength(1)
      expect(nthCalls[0].args[0]).toBe(2)
    })

    it('#N in the middle narrows then continues descending', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'table-row #2 delete-button')

      // Step 1: page.locator(table-row CSS)
      expect(calls[0]).toMatchObject({ method: 'locator', on: 'page' })

      // Step 2: .nth(1) for #2
      const nthCalls = calls.filter((c) => c.method === 'nth')
      expect(nthCalls).toHaveLength(1)
      expect(nthCalls[0].args[0]).toBe(1)

      // Step 3: descendant lookup for delete-button (xpath + CSS + .or())
      const orCalls = calls.filter((c) => c.method === 'or')
      expect(orCalls).toHaveLength(1)
    })

    it('#N does not trigger data-key or descendant matching', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'item #1')

      // Should only have: locator (token1), nth — no xpath self-match, no descendant locator
      const locatorCalls = calls.filter((c) => c.method === 'locator')
      expect(locatorCalls).toHaveLength(1) // just the initial token

      const nthCalls = calls.filter((c) => c.method === 'nth')
      expect(nthCalls).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// resolveSelectorWithFallback tests
// ---------------------------------------------------------------------------

/**
 * Create a mock locator with waitFor / isVisible / count support.
 * `visible` controls whether the locator resolves or rejects.
 */
function createAsyncMockLocator(visible: boolean) {
  return {
    _visible: visible,
    waitFor: vi.fn(async () => {
      if (!visible) throw new Error('Timeout waiting for element')
    }),
    isVisible: vi.fn(async () => visible),
    count: vi.fn(async () => (visible ? 1 : 0)),
    // Needed so resolveSelector can chain on it (unused in fallback tests)
    locator: vi.fn(() => createAsyncMockLocator(visible)),
    or: vi.fn(() => createAsyncMockLocator(visible)),
    nth: vi.fn(() => createAsyncMockLocator(visible)),
  }
}

/**
 * Build a mock page + scope pair.  The page always resolves selectors into
 * the provided mock locators so we can control visibility per-test.
 */
function createFallbackMocks(scopedVisible: boolean, rootVisible: boolean) {
  const scopedLocator = createAsyncMockLocator(scopedVisible)
  const rootLocator = createAsyncMockLocator(rootVisible)

  // We can't easily intercept resolveSelector inside the module, so we
  // construct a scope and page whose .locator() returns our mocks directly.
  // resolveSelectorWithFallback calls resolveSelector(scope, sel) and
  // resolveSelector(page, sel) — for a single-token selector that's just
  // scope.locator(css) and page.locator(css).
  const scope: any = {
    locator: vi.fn(() => scopedLocator),
  }
  const page: any = {
    locator: vi.fn(() => rootLocator),
  }

  return { scope, page, scopedLocator, rootLocator }
}

describe('resolveSelectorWithFallback', () => {
  describe('with timeout (sequential fallback)', () => {
    it('returns scoped locator when element is visible in scope', async () => {
      const { scope, page, scopedLocator } = createFallbackMocks(true, true)

      const result = await resolveSelectorWithFallback(scope, page, 'btn', 'click(btn)', 5000)

      // Scoped waitFor should be called with the timeout
      expect(scopedLocator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 })
      // Should return the scoped locator (identity check)
      expect(result).toBe(scopedLocator)
    })

    it('falls back to root when scoped locator times out', async () => {
      const { scope, page, scopedLocator, rootLocator } = createFallbackMocks(false, true)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await resolveSelectorWithFallback(scope, page, 'btn', 'click(btn)', 5000)

      // Scoped waitFor should have been attempted and failed
      expect(scopedLocator.waitFor).toHaveBeenCalled()
      // Root waitFor should be called as fallback
      expect(rootLocator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 })
      expect(result).toBe(rootLocator)
      // Warning should fire
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found in current scope')
      )
      warnSpy.mockRestore()
    })

    it('does not call root waitFor when scoped succeeds', async () => {
      const { scope, page, rootLocator } = createFallbackMocks(true, true)

      await resolveSelectorWithFallback(scope, page, 'btn', 'click(btn)', 5000)

      // Root locator's waitFor should NOT be called
      expect(rootLocator.waitFor).not.toHaveBeenCalled()
    })

    it('throws when element is not found in either scope', async () => {
      const { scope, page } = createFallbackMocks(false, false)
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(
        resolveSelectorWithFallback(scope, page, 'btn', 'click(btn)', 5000)
      ).rejects.toThrow()

      vi.mocked(console.warn).mockRestore()
    })

    it('suppresses warning when context is undefined', async () => {
      const { scope, page } = createFallbackMocks(false, true)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await resolveSelectorWithFallback(scope, page, 'btn', undefined, 5000)

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('without timeout (point-in-time fallback)', () => {
    it('returns scoped locator when count > 0', async () => {
      const { scope, page, scopedLocator } = createFallbackMocks(true, true)

      const result = await resolveSelectorWithFallback(scope, page, 'btn')

      expect(scopedLocator.count).toHaveBeenCalled()
      expect(result).toBe(scopedLocator)
    })

    it('falls back to root when scoped count is 0', async () => {
      const { scope, page, rootLocator } = createFallbackMocks(false, true)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await resolveSelectorWithFallback(scope, page, 'btn', 'click(btn)')

      expect(result).toBe(rootLocator)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found in current scope')
      )
      warnSpy.mockRestore()
    })

    it('returns scoped locator when neither has matches (for Playwright error)', async () => {
      const { scope, page, scopedLocator } = createFallbackMocks(false, false)

      const result = await resolveSelectorWithFallback(scope, page, 'btn')

      // Returns scoped so Playwright gives the error with scope context
      expect(result).toBe(scopedLocator)
    })
  })

  describe('scope === page (no fallback needed)', () => {
    it('resolves directly from page without fallback logic', async () => {
      const page: any = {
        locator: vi.fn(() => createAsyncMockLocator(true)),
      }

      const result = await resolveSelectorWithFallback(page, page, 'btn', 'click(btn)', 5000)

      // Should have called page.locator once (not twice for scope + root)
      expect(page.locator).toHaveBeenCalledTimes(1)
      expect(result).toBeDefined()
    })
  })
})
