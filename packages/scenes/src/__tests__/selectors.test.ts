import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSelector, setAliases, clearAliases } from '../selectors.js'

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
})
