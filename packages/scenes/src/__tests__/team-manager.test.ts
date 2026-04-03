import { describe, it, expect, vi } from 'vitest'
import { TeamManager } from '../team-manager.js'
import type { ResolvedTeam } from '../types.js'
import type { StorageState } from '../warmup.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_WARMUP_STATE: StorageState = {
  cookies: [{ name: 'session', value: 'abc', domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
  origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'token', value: 'from-warmup' }] }],
}

function mockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    url: vi.fn().mockReturnValue('http://localhost:3000'),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      first: vi.fn().mockReturnThis(),
    }),
    getByText: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }
}

function mockContext() {
  return {
    newPage: vi.fn().mockResolvedValue(mockPage()),
    storageState: vi.fn().mockResolvedValue(MOCK_WARMUP_STATE),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function mockBrowser() {
  return {
    newContext: vi.fn().mockImplementation(() => Promise.resolve(mockContext())),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

// ---------------------------------------------------------------------------
// storageState injection via getActor / createPage
// ---------------------------------------------------------------------------

describe('TeamSession storageState injection', () => {
  it('creates context with no storageState when actor has neither warmup nor localStorage', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: { user: { key: 'u1' } },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)
    const session = await manager.createSession(0, 5000, 500, 'http://localhost:3000')

    await session.getActor('user')

    const opts = browser.newContext.mock.calls[0][0]
    expect(opts.storageState).toBeUndefined()
    expect(opts.baseURL).toBe('http://localhost:3000')
  })

  it('lazily runs warmup on first getActor and injects storageState', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: { user: { key: 'u1', warmup: async () => {} } },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)
    const session = await manager.createSession(0, 5000, 500, 'http://localhost:3000')

    await session.getActor('user')

    // newContext called twice: once for warmup (temp context), once for the actor
    expect(browser.newContext).toHaveBeenCalledTimes(2)
    const actorContextOpts = browser.newContext.mock.calls[1][0]
    expect(actorContextOpts.storageState).toBeDefined()
    expect(actorContextOpts.storageState.cookies).toHaveLength(1)
  })

  it('injects actor localStorage without warmup', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: {
        user: {
          key: 'u1',
          localStorage: { 'intro-seen': 'true', 'theme': 'dark' },
        },
      },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)
    const session = await manager.createSession(0, 5000, 500, 'http://localhost:3000')

    await session.getActor('user')

    // Only one newContext call (no warmup)
    expect(browser.newContext).toHaveBeenCalledTimes(1)
    const opts = browser.newContext.mock.calls[0][0]
    expect(opts.storageState).toBeDefined()
    expect(opts.storageState.cookies).toEqual([])
    const origin = opts.storageState.origins.find((o: any) => o.origin === 'http://localhost:3000')
    expect(origin).toBeDefined()
    expect(origin.localStorage).toEqual(
      expect.arrayContaining([
        { name: 'intro-seen', value: 'true' },
        { name: 'theme', value: 'dark' },
      ])
    )
  })

  it('merges actor localStorage on top of warmup storageState', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: {
        user: {
          key: 'u1',
          warmup: async () => {},
          localStorage: { 'intro-seen': 'true', 'token': 'override' },
        },
      },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)
    const session = await manager.createSession(0, 5000, 500, 'http://localhost:3000')

    await session.getActor('user')

    // warmup context + actor context
    const actorContextOpts = browser.newContext.mock.calls[1][0]
    const origin = actorContextOpts.storageState.origins.find((o: any) => o.origin === 'http://localhost:3000')

    // 'token' should be overridden by actor config
    const tokenEntry = origin.localStorage.find((e: any) => e.name === 'token')
    expect(tokenEntry.value).toBe('override')

    // 'intro-seen' should be added
    const introEntry = origin.localStorage.find((e: any) => e.name === 'intro-seen')
    expect(introEntry.value).toBe('true')

    // cookies from warmup should still be present
    expect(actorContextOpts.storageState.cookies).toHaveLength(1)
  })

  it('injects storageState via createPage (used by flow model)', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: {
        user: {
          key: 'u1',
          localStorage: { 'flag': 'on' },
        },
      },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)
    const session = await manager.createSession(0, 5000, 500, 'http://localhost:3000')

    await session.createPage('user')

    const opts = browser.newContext.mock.calls[0][0]
    expect(opts.storageState).toBeDefined()
    const origin = opts.storageState.origins.find((o: any) => o.origin === 'http://localhost:3000')
    expect(origin.localStorage).toEqual([{ name: 'flag', value: 'on' }])
  })

  it('caches warmup across sessions (same actor key warmed up only once)', async () => {
    const browser = mockBrowser()
    const teams: ResolvedTeam[] = [{
      actors: { user: { key: 'shared-key', warmup: async () => {} } },
      meta: {},
    }]

    const manager = new TeamManager(teams)
    manager.setBrowser(browser as any)

    // First session
    const session1 = await manager.createSession(0, 5000, 500, 'http://localhost:3000')
    await session1.getActor('user')

    // Second session — same actor key should reuse cached warmup
    const session2 = await manager.createSession(0, 5000, 500, 'http://localhost:3000')
    await session2.getActor('user')

    // 1 warmup context + 2 actor contexts = 3 total
    expect(browser.newContext).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// TeamManager.getTeams
// ---------------------------------------------------------------------------

describe('TeamManager.getTeams', () => {
  it('returns all resolved teams', () => {
    const teams: ResolvedTeam[] = [
      { actors: { a: { key: '1' } }, meta: {} },
      { actors: { b: { key: '2' } }, meta: { name: 'Team 2' } },
    ]
    const manager = new TeamManager(teams)
    expect(manager.getTeams()).toBe(teams)
  })
})
