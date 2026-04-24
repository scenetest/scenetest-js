import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSelector, buildSelectorMissError, setAliases, clearAliases } from '../selectors.js'

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
      expect(String(xpathCall!.args[0])).toContain('@data-key="review-link"')

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

    it('data-key same-element pattern: uses xpath self-match with all attributes', () => {
      const { page, calls } = createMockPage()

      resolveSelector(page, 'playlist-row 12345 like-button')

      // For each non-first token, should have xpath self::*[...all attrs...]
      const xpathCalls = calls.filter(
        (c) => c.method === 'locator' && String(c.args[0]).includes('xpath=self')
      )
      expect(xpathCalls).toHaveLength(2) // once for "12345", once for "like-button"

      // Each xpath predicate covers all attribute types, including data-key
      expect(String(xpathCalls[0].args[0])).toContain('@data-key="12345"')
      expect(String(xpathCalls[0].args[0])).toContain('@data-testid="12345"')
      expect(String(xpathCalls[1].args[0])).toContain('@data-key="like-button"')
      expect(String(xpathCalls[1].args[0])).toContain('@data-testid="like-button"')

      // NO .first() called anywhere
      const firstCalls = calls.filter((c) => c.method === 'first')
      expect(firstCalls).toHaveLength(0)
    })

    it('same-element data-testid match: deck-tile case where data-key and data-testid share an element', () => {
      // Regression: selector "decks-list-grid kan deck-tile" where the button has
      // both data-key="kan" AND data-testid="deck-tile" — the last token must
      // match the same element via data-testid, not only via data-key.
      const { page, calls } = createMockPage()

      resolveSelector(page, 'decks-list-grid kan deck-tile')

      const xpathCalls = calls.filter(
        (c) => c.method === 'locator' && String(c.args[0]).includes('xpath=self')
      )
      // Two same-element checks: one for "kan", one for "deck-tile"
      expect(xpathCalls).toHaveLength(2)

      // "deck-tile" xpath must include data-testid so it can match [data-testid="deck-tile"]
      const deckTileXpath = String(xpathCalls[1].args[0])
      expect(deckTileXpath).toContain('@data-testid="deck-tile"')
      expect(deckTileXpath).toContain('@aria-label="deck-tile"')
      expect(deckTileXpath).toContain('@data-key="deck-tile"')
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

  // ---------------------------------------------------------------------------
  // Same-element attribute coexistence
  //
  // When data-key and another attribute (e.g. data-testid) share a single DOM
  // element, the selector chain should resolve regardless of which attribute
  // comes first in the token sequence.
  // ---------------------------------------------------------------------------
  describe('same-element attribute coexistence', () => {
    /**
     * Pull out the xpath same-element locator calls in the order they were made.
     * Each non-first token in a multi-token selector produces exactly one xpath call.
     */
    function xpathCalls(calls: Array<{ method: string; args: unknown[]; on: string }>) {
      return calls
        .filter((c) => c.method === 'locator' && String(c.args[0]).startsWith('xpath=self'))
        .map((c) => String(c.args[0]))
    }

    it('same-element xpath includes all six attribute types', () => {
      const { page, calls } = createMockPage()
      resolveSelector(page, 'grid item')

      const [xpath] = xpathCalls(calls)
      expect(xpath).toContain('@aria-label="item"')
      expect(xpath).toContain('@id="item"')
      expect(xpath).toContain('@data-testid="item"')
      expect(xpath).toContain('@data-name="item"')
      expect(xpath).toContain('@data-key="item"')
      expect(xpath).toContain('@name="item"')
    })

    it('data-key token then data-testid token (kan → deck-tile order)', () => {
      // Element has data-key="kan" AND data-testid="deck-tile" on the same node.
      // "kan" is found via descendant data-key match; "deck-tile" must then match
      // the same element via data-testid — not a child.
      const { page, calls } = createMockPage()
      resolveSelector(page, 'decks-list-grid kan deck-tile')

      const [kanXpath, deckTileXpath] = xpathCalls(calls)

      expect(kanXpath).toContain('@data-key="kan"')

      // Critical: deck-tile same-element check must include @data-testid
      expect(deckTileXpath).toContain('@data-testid="deck-tile"')
    })

    it('data-testid token then data-key token (deck-tile → kan order)', () => {
      // Reversed order: "deck-tile" found as descendant via data-testid, then
      // "kan" matches the same element via data-key.
      const { page, calls } = createMockPage()
      resolveSelector(page, 'decks-list-grid deck-tile kan')

      const [deckTileXpath, kanXpath] = xpathCalls(calls)

      expect(deckTileXpath).toContain('@data-testid="deck-tile"')
      expect(kanXpath).toContain('@data-key="kan"')
    })

    it('both orderings produce the same chain structure', () => {
      // Neither ordering should be privileged — same number of or() calls either way.
      const forward = createMockPage()
      const reversed = createMockPage()

      resolveSelector(forward.page, 'grid kan deck-tile')
      resolveSelector(reversed.page, 'grid deck-tile kan')

      const forwardOrCount = forward.calls.filter((c) => c.method === 'or').length
      const reversedOrCount = reversed.calls.filter((c) => c.method === 'or').length
      expect(forwardOrCount).toBe(reversedOrCount)
    })

    it('aria-label and data-key on the same element', () => {
      const { page, calls } = createMockPage()
      resolveSelector(page, 'nav Japanese settings')

      const [, settingsXpath] = xpathCalls(calls)
      expect(settingsXpath).toContain('@aria-label="settings"')
      expect(settingsXpath).toContain('@data-key="settings"')
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
// buildSelectorMissError tests
// ---------------------------------------------------------------------------

/**
 * Create a mock locator that supports the `count()` calls used by
 * buildSelectorMissError's diagnostic check.
 */
function createCountingLocator(count: number) {
  return {
    count: vi.fn(async () => count),
    // resolveSelector chains through these for multi-token selectors
    locator: vi.fn(() => createCountingLocator(count)),
    or: vi.fn(() => createCountingLocator(count)),
    nth: vi.fn(() => createCountingLocator(count)),
  }
}

describe('buildSelectorMissError', () => {
  it('says "scope may be too narrow" when element exists at document root', async () => {
    const scope: any = { locator: vi.fn(() => createCountingLocator(0)) }
    const page: any = { locator: vi.fn(() => createCountingLocator(1)) }
    const cause = new Error('Timeout 5000ms exceeded')

    const err = await buildSelectorMissError(scope, page, 'click', 'deck-link', cause)

    expect(err.message).toContain('click(deck-link) timed out')
    expect(err.message).toContain('not visible in current scope')
    expect(err.message).toContain('Found 1 match at document root')
    expect(err.message).toContain('scope may be too narrow')
    expect((err as Error & { cause?: unknown }).cause).toBe(cause)
  })

  it('uses the action name in the message', async () => {
    const scope: any = { locator: vi.fn(() => createCountingLocator(0)) }
    const page: any = { locator: vi.fn(() => createCountingLocator(0)) }

    const seeErr = await buildSelectorMissError(scope, page, 'see', 'btn', new Error())
    const scopeErr = await buildSelectorMissError(scope, page, 'scope', 'btn', new Error())

    expect(seeErr.message).toContain('see(btn) timed out')
    expect(scopeErr.message).toContain('scope(btn) timed out')
  })

  it('pluralizes when multiple matches exist at root', async () => {
    const scope: any = { locator: vi.fn(() => createCountingLocator(0)) }
    const page: any = { locator: vi.fn(() => createCountingLocator(3)) }

    const err = await buildSelectorMissError(scope, page, 'click', 'deck-link', new Error('timeout'))

    expect(err.message).toContain('Found 3 matches at document root')
  })

  it('says "check spelling" when element exists nowhere', async () => {
    const scope: any = { locator: vi.fn(() => createCountingLocator(0)) }
    const page: any = { locator: vi.fn(() => createCountingLocator(0)) }

    const err = await buildSelectorMissError(scope, page, 'see', 'typoed-name', new Error('timeout'))

    expect(err.message).toContain('Not found anywhere on the page')
    expect(err.message).toContain('Check the selector spelling')
  })

  it('omits hint when scope was already page root', async () => {
    // If scope === page, there's no narrowing to blame
    const page: any = { locator: vi.fn(() => createCountingLocator(0)) }

    const err = await buildSelectorMissError(page, page, 'see', 'btn', new Error('timeout'))

    expect(err.message).toContain('see(btn) timed out')
    // Should NOT include either hint — there's no scope narrowing to be wrong about
    expect(err.message).not.toContain('document root')
    expect(err.message).not.toContain('Check the selector spelling')
  })

  it('does not mask the original error if diagnostic count() throws', async () => {
    const scope: any = { locator: vi.fn(() => createCountingLocator(0)) }
    const page: any = {
      locator: vi.fn(() => ({
        count: vi.fn(async () => {
          throw new Error('diagnostic blew up')
        }),
        locator: vi.fn(() => createCountingLocator(0)),
        or: vi.fn(() => createCountingLocator(0)),
        nth: vi.fn(() => createCountingLocator(0)),
      })),
    }
    const cause = new Error('original timeout')

    const err = await buildSelectorMissError(scope, page, 'scope', 'btn', cause)

    // Should still produce an error with the original cause attached
    expect(err.message).toContain('scope(btn) timed out')
    expect((err as Error & { cause?: unknown }).cause).toBe(cause)
  })
})
