import { describe, it, expect, vi } from 'vitest'
import { WarmupCache, executeMacroOnPage } from '../warmup.js'
import type { ActorConfig } from '../types.js'
import type { StorageState } from '../warmup.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_STATE: StorageState = {
  cookies: [{ name: 'session', value: 'abc', domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
  origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'token', value: 'xyz' }] }],
}

function mockContext() {
  return {
    newPage: vi.fn().mockResolvedValue(mockPage()),
    storageState: vi.fn().mockResolvedValue(MOCK_STATE),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function mockPage() {
  const locator = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    first: vi.fn().mockReturnThis(),
    isVisible: vi.fn().mockResolvedValue(true),
    locator: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  }
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    getByText: vi.fn().mockReturnValue(locator),
    locator: vi.fn().mockReturnValue(locator),
    _locator: locator,
  }
}

function mockBrowser() {
  return {
    newContext: vi.fn().mockImplementation(() => Promise.resolve(mockContext())),
  }
}

// ---------------------------------------------------------------------------
// WarmupCache
// ---------------------------------------------------------------------------

describe('WarmupCache', () => {
  it('returns undefined for actors without warmup', async () => {
    const cache = new WarmupCache()
    const result = await cache.ensure(
      mockBrowser() as any,
      { key: 'u1' },
      'http://localhost:3000',
      5000
    )
    expect(result).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('runs warmup on first use and caches the result', async () => {
    const cache = new WarmupCache()
    const browser = mockBrowser()
    const config: ActorConfig = {
      key: 'u1',
      warmup: async (_page, _actor) => { /* login actions */ },
    }

    const result = await cache.ensure(browser as any, config, 'http://localhost:3000', 5000)

    expect(result).toEqual(MOCK_STATE)
    expect(cache.size).toBe(1)
    expect(browser.newContext).toHaveBeenCalledTimes(1)
  })

  it('returns cached state on second call (no re-warmup)', async () => {
    const cache = new WarmupCache()
    const browser = mockBrowser()
    const config: ActorConfig = {
      key: 'u1',
      warmup: async () => {},
    }

    const first = await cache.ensure(browser as any, config, 'http://localhost:3000', 5000)
    const second = await cache.ensure(browser as any, config, 'http://localhost:3000', 5000)

    expect(first).toBe(second)
    expect(browser.newContext).toHaveBeenCalledTimes(1) // only once
  })

  it('deduplicates concurrent requests for the same key', async () => {
    const cache = new WarmupCache()
    const browser = mockBrowser()
    const config: ActorConfig = {
      key: 'u1',
      warmup: async () => {},
    }

    // Fire two ensures concurrently
    const [a, b] = await Promise.all([
      cache.ensure(browser as any, config, 'http://localhost:3000', 5000),
      cache.ensure(browser as any, config, 'http://localhost:3000', 5000),
    ])

    expect(a).toBe(b)
    expect(browser.newContext).toHaveBeenCalledTimes(1) // only one warmup ran
  })

  it('caches different keys independently', async () => {
    const cache = new WarmupCache()
    const browser = mockBrowser()

    await cache.ensure(browser as any, { key: 'u1', warmup: async () => {} }, 'http://localhost:3000', 5000)
    await cache.ensure(browser as any, { key: 'u2', warmup: async () => {} }, 'http://localhost:3000', 5000)

    expect(cache.size).toBe(2)
    expect(browser.newContext).toHaveBeenCalledTimes(2)
  })

  it('removes failed entry so it can be retried', async () => {
    const cache = new WarmupCache()
    let callCount = 0
    const browser = {
      newContext: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            newPage: vi.fn().mockResolvedValue(mockPage()),
            storageState: vi.fn().mockRejectedValue(new Error('session expired')),
            close: vi.fn().mockResolvedValue(undefined),
          })
        }
        return Promise.resolve(mockContext())
      }),
    }
    const config: ActorConfig = { key: 'u1', warmup: async () => {} }

    // First attempt fails
    await expect(
      cache.ensure(browser as any, config, 'http://localhost:3000', 5000)
    ).rejects.toThrow()
    expect(cache.size).toBe(0) // entry removed

    // Second attempt succeeds
    const result = await cache.ensure(browser as any, config, 'http://localhost:3000', 5000)
    expect(result).toEqual(MOCK_STATE)
    expect(cache.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// executeMacroOnPage
// ---------------------------------------------------------------------------

describe('executeMacroOnPage', () => {
  it('executes openTo action', async () => {
    const page = mockPage()
    await executeMacroOnPage(page as any, ['openTo /login'], { key: 'u1' }, 5000)
    expect(page.goto).toHaveBeenCalledWith('/login', { timeout: 5000 })
  })

  it('executes see action', async () => {
    const page = mockPage()
    await executeMacroOnPage(page as any, ['see login-form'], { key: 'u1' }, 5000)
    expect(page._locator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 5000 })
  })

  it('executes click action', async () => {
    const page = mockPage()
    await executeMacroOnPage(page as any, ['click submit'], { key: 'u1' }, 5000)
    expect(page._locator.click).toHaveBeenCalledWith({ timeout: 5000 })
  })

  it('executes typeInto with [self.field] interpolation', async () => {
    const page = mockPage()
    const config: ActorConfig = { key: 'u1', email: 'test@example.com', password: 'secret' }

    await executeMacroOnPage(
      page as any,
      ['typeInto email [self.email]', 'typeInto password [self.password]'],
      config,
      5000
    )

    expect(page._locator.fill).toHaveBeenCalledTimes(2)
    expect(page._locator.fill).toHaveBeenCalledWith('test@example.com', { timeout: 5000 })
    expect(page._locator.fill).toHaveBeenCalledWith('secret', { timeout: 5000 })
  })

  it('executes wait action', async () => {
    const page = mockPage()
    const start = Date.now()
    await executeMacroOnPage(page as any, ['wait 50'], { key: 'u1' }, 5000)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })

  it('skips comments and empty lines', async () => {
    const page = mockPage()
    await executeMacroOnPage(
      page as any,
      ['# comment', '', '// another comment', 'openTo /'],
      { key: 'u1' },
      5000
    )
    expect(page.goto).toHaveBeenCalledTimes(1)
  })

  it('throws on unsupported action', async () => {
    const page = mockPage()
    await expect(
      executeMacroOnPage(page as any, ['emit done'], { key: 'u1' }, 5000)
    ).rejects.toThrow('unsupported action "emit"')
  })

  it('throws on unknown [self.field]', async () => {
    const page = mockPage()
    await expect(
      executeMacroOnPage(page as any, ['typeInto input [self.nonexistent]'], { key: 'u1' }, 5000)
    ).rejects.toThrow('[self.nonexistent]')
  })
})
