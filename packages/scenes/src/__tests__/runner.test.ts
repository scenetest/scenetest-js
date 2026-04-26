import { describe, it, expect, vi } from 'vitest'
import { runCleanup, runSetup } from '../runner.js'
import type { RegisteredScene } from '../types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(overrides: Partial<RegisteredScene> = {}): RegisteredScene {
  return {
    name: 'test scene',
    file: '/test/scene.spec.md',
    fn: async () => {},
    cleanup: [],
    setup: [],
    ...overrides,
  }
}

const team = {
  learner: { key: 'learner-123', username: 'alice', email: 'alice@test.com' },
  friend:  { key: 'friend-456', username: 'bob',   email: 'bob@test.com' },
}

const teamMeta = {
  name: 'Kannada Team',
  tags: { lang: 'kan', region: 'asia' },
}

const testStart = '2026-04-02T10:00:00.000Z'

// ---------------------------------------------------------------------------
// runCleanup
// ---------------------------------------------------------------------------

describe('runCleanup', () => {
  it('does nothing when cleanup is empty', async () => {
    const scene = makeScene()
    const server = { supabase: { ran: false } }
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(server.supabase.ran).toBe(false)
  })

  it('evaluates a single cleanup expression with server in scope', async () => {
    const calls: string[] = []
    const server = {
      db: {
        delete: (table: string) => { calls.push(`delete:${table}`); return Promise.resolve() },
      },
    }
    const scene = makeScene({ cleanup: ["db.delete('user_deck')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(calls).toEqual(["delete:user_deck"])
  })

  it('runs all expressions when multiple cleanup: lines specified', async () => {
    const calls: string[] = []
    const server = {
      db: {
        delete: (table: string) => { calls.push(`delete:${table}`); return Promise.resolve() },
      },
    }
    const scene = makeScene({
      cleanup: ["db.delete('comments')", "db.delete('notifications')"],
    })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(calls).toEqual(['delete:comments', 'delete:notifications'])
  })

  it('interpolates [role.field] tokens', async () => {
    let capturedKey = ''
    const server = {
      db: {
        deleteByKey: (key: string) => { capturedKey = key; return Promise.resolve() },
      },
    }
    const scene = makeScene({ cleanup: ["db.deleteByKey('[learner.key]')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(capturedKey).toBe('learner-123')
  })

  it('interpolates [team.field] tokens from team metadata tags', async () => {
    let capturedLang = ''
    const server = {
      db: {
        deleteByLang: (lang: string) => { capturedLang = lang; return Promise.resolve() },
      },
    }
    const scene = makeScene({ cleanup: ["db.deleteByLang('[team.lang]')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(capturedLang).toBe('kan')
  })

  it('interpolates [testStart] with the ISO timestamp', async () => {
    let capturedTs = ''
    const server = {
      db: {
        deleteAfter: (ts: string) => { capturedTs = ts; return Promise.resolve() },
      },
    }
    const scene = makeScene({ cleanup: ["db.deleteAfter('[testStart]')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(capturedTs).toBe(testStart)
  })

  it('logs a warning and skips when no server config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const scene = makeScene({ cleanup: ["db.delete('x')"] })
    await runCleanup(scene, team, teamMeta, undefined, testStart)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no server config'))
    warnSpy.mockRestore()
  })

  it('logs a warning but does not throw when expression errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = {
      db: {
        badCall: () => { throw new Error('db connection refused') },
      },
    }
    const scene = makeScene({ cleanup: ['db.badCall()'] })
    await expect(runCleanup(scene, team, teamMeta, server, testStart)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('db connection refused'))
    warnSpy.mockRestore()
  })

  it('throws interpolation error and logs warning for unknown role', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = { db: {} }
    const scene = makeScene({ cleanup: ["db.fn('[ghost.key]')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'))
    warnSpy.mockRestore()
  })

  it('throws interpolation error and logs warning for unknown team tag', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = { db: {} }
    const scene = makeScene({ cleanup: ["db.fn('[team.notexist]')"] })
    await runCleanup(scene, team, teamMeta, server, testStart)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('notexist'))
    warnSpy.mockRestore()
  })

  it('logs the phase suffix so before/after passes are distinguishable', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const server = { db: { delete: () => Promise.resolve() } }
    const scene = makeScene({ cleanup: ["db.delete('x')"] })

    await runCleanup(scene, team, teamMeta, server, testStart, 'before')
    await runCleanup(scene, team, teamMeta, server, testStart, 'after')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('cleanup ran (before)'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('cleanup ran (after)'))
    logSpy.mockRestore()
  })

  it('runs the cleanup expressions again when invoked with phase=after', async () => {
    const calls: string[] = []
    const server = {
      db: {
        delete: (table: string) => { calls.push(`delete:${table}`); return Promise.resolve() },
      },
    }
    const scene = makeScene({ cleanup: ["db.delete('user_deck')"] })

    await runCleanup(scene, team, teamMeta, server, testStart, 'before')
    await runCleanup(scene, team, teamMeta, server, testStart, 'after')

    expect(calls).toEqual(['delete:user_deck', 'delete:user_deck'])
  })
})

// ---------------------------------------------------------------------------
// runSetup
// ---------------------------------------------------------------------------

describe('runSetup', () => {
  it('does nothing when setup is empty', async () => {
    const calls: string[] = []
    const server = { db: { update: (t: string) => { calls.push(t); return Promise.resolve() } } }
    const scene = makeScene()
    await runSetup(scene, team, teamMeta, server, testStart)
    expect(calls).toHaveLength(0)
  })

  it('evaluates each setup expression in order', async () => {
    const calls: string[] = []
    const server = {
      db: {
        update: (t: string) => { calls.push(`update:${t}`); return Promise.resolve() },
      },
    }
    const scene = makeScene({
      setup: ["db.update('step1')", "db.update('step2')"],
    })
    await runSetup(scene, team, teamMeta, server, testStart)
    expect(calls).toEqual(['update:step1', 'update:step2'])
  })

  it('interpolates [role.field] and [team.field] in setup expressions', async () => {
    const captured: string[] = []
    const server = {
      db: {
        seed: (key: string, lang: string) => {
          captured.push(`${key}:${lang}`)
          return Promise.resolve()
        },
      },
    }
    const scene = makeScene({ setup: ["db.seed('[learner.key]', '[team.lang]')"] })
    await runSetup(scene, team, teamMeta, server, testStart)
    expect(captured).toEqual(['learner-123:kan'])
  })

  it('logs a warning but does not throw on error, continues remaining expressions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: string[] = []
    const server = {
      db: {
        bad: () => { throw new Error('setup failed') },
        ok: () => { calls.push('ok'); return Promise.resolve() },
      },
    }
    const scene = makeScene({ setup: ['db.bad()', 'db.ok()'] })
    await runSetup(scene, team, teamMeta, server, testStart)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('setup failed'))
    expect(calls).toEqual(['ok'])
    warnSpy.mockRestore()
  })
})
