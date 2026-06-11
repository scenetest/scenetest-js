import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { createServer, type ViteDevServer } from 'vite'
import { createScenetestMiddleware } from '../middleware.js'
import { clearConfigCache } from '../config.js'
import {
  registerAssertions,
  clearRegistry,
  RESOLVED_VIRTUAL_MODULE_ID,
} from '../virtual-module.js'
import { scenetest } from '../index.js'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

const VIRTUAL_ID = 'virtual:scenetest-assertions'

type ServerFn = (server: unknown, data: unknown, helpers: Record<string, unknown>) => unknown

/**
 * Stub dev server without `environments` — exercises the ssrLoadModule
 * fallback path (what the middleware does on vite 5).
 */
function stubServer(
  assertions: Record<string, ServerFn>,
  opts: { failVirtual?: boolean; failConfig?: boolean } = {}
): ViteDevServer {
  return {
    ssrLoadModule: async (id: string) => {
      if (id === VIRTUAL_ID) {
        if (opts.failVirtual) throw new Error('virtual module exploded')
        return { assertions }
      }
      if (opts.failConfig) throw new Error('config boom')
      return {}
    },
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  } as unknown as ViteDevServer
}

interface MockResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  end: (chunk?: string) => void
  setHeader: (k: string, v: string) => void
}

function mockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    headers: {},
    body: '',
    end(chunk) {
      if (typeof chunk === 'string') res.body += chunk
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v
    },
  }
  return res
}

async function callRun(
  mw: ReturnType<typeof createScenetestMiddleware>,
  payload: { id: string; title: string; key?: string; data?: unknown }
): Promise<MockResponse> {
  const res = mockRes()
  const req = Readable.from([JSON.stringify(payload)]) as unknown as Record<string, unknown>
  ;(req as { method: string }).method = 'POST'
  ;(req as { url: string }).url = '/__scenetest/run'
  ;(req as { headers: Record<string, string> }).headers = {}
  await mw(req as never, res as never, () => {})
  return res
}

describe('POST /__scenetest/run', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-run-'))
    clearConfigCache()
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('delivers an AbortSignal to the serverFn via the helpers object', async () => {
    const seen: { signal?: unknown } = {}
    const mw = createScenetestMiddleware(
      stubServer({
        'check-1': (_server, _data, helpers) => {
          seen.signal = helpers.signal
          const should = helpers.should as (d: string, c: boolean) => void
          should('signal delivered', helpers.signal instanceof AbortSignal)
        },
      }),
      tmp
    )

    const res = await callRun(mw, { id: 'check-1', title: 'My check', data: null })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('pass')
    expect(seen.signal).toBeInstanceOf(AbortSignal)
    expect((seen.signal as AbortSignal).aborted).toBe(false)
  })

  it('times out a hung serverFn and responds promptly with a fail result', async () => {
    const mw = createScenetestMiddleware(
      stubServer({
        'check-1': () => new Promise(() => {}), // never resolves, ignores the signal
      }),
      tmp,
      { serverCheckTimeout: 50 }
    )

    const started = Date.now()
    const res = await callRun(mw, { id: 'check-1', title: 'Hung check', data: null })
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(2000)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('fail')
    expect(body.results[0].description).toBe('Hung check: serverCheck timed out after 50ms')
  })

  it('aborts the signal at the deadline so a well-behaved serverFn can stop early', async () => {
    let abortFired = false
    const mw = createScenetestMiddleware(
      stubServer({
        'check-1': (_server, _data, helpers) =>
          new Promise<void>((resolve) => {
            const signal = helpers.signal as AbortSignal
            signal.addEventListener('abort', () => {
              abortFired = true
              resolve()
            })
          }),
      }),
      tmp,
      { serverCheckTimeout: 50 }
    )

    const started = Date.now()
    const res = await callRun(mw, { id: 'check-1', title: 'Abortable check', data: null })
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(2000)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).success).toBe(true)
    expect(abortFired).toBe(true)
  })

  it('does not crash on a serverFn that rejects after the timeout', async () => {
    let rejectLate: ((err: Error) => void) | undefined
    const mw = createScenetestMiddleware(
      stubServer({
        'check-1': () =>
          new Promise((_resolve, reject) => {
            rejectLate = reject
          }),
      }),
      tmp,
      { serverCheckTimeout: 50 }
    )

    const res = await callRun(mw, { id: 'check-1', title: 'Late reject', data: null })
    expect(JSON.parse(res.body).results[0].description).toContain('timed out')

    // Reject after the response was already sent — must not become an
    // unhandled rejection (vitest would fail the test run if it did).
    rejectLate?.(new Error('too late'))
    await new Promise((r) => setTimeout(r, 10))
  })

  it('returns 200 with a fail result when the virtual module fails to load', async () => {
    const mw = createScenetestMiddleware(stubServer({}, { failVirtual: true }), tmp)

    const res = await callRun(mw, { id: 'check-1', title: 'Broken module', data: null })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('fail')
    expect(body.results[0].description).toBe('Broken module: failed to load server assertions')
    expect(body.results[0].context.error).toContain('virtual module exploded')
  })

  it('returns 200 with a fail result when no serverFn matches the id', async () => {
    const mw = createScenetestMiddleware(stubServer({}), tmp)

    const res = await callRun(mw, { id: 'missing-id', title: 'Orphan check', data: null })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('fail')
    expect(body.results[0].description).toContain('Orphan check')
    expect(body.results[0].description).toContain('missing-id')
  })

  it('returns 200 with a fail result when the scenetest config fails to load', async () => {
    // A config file must exist for loadConfig() to attempt loading it
    fs.mkdirSync(path.join(tmp, 'scenetest'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'scenetest', 'config.ts'), 'export default {}')

    const mw = createScenetestMiddleware(
      stubServer({ 'check-1': () => {} }, { failConfig: true }),
      tmp
    )

    const res = await callRun(mw, { id: 'check-1', title: 'Config check', data: null })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('fail')
    expect(body.results[0].description).toBe('Config check: failed to load scenetest config')
    expect(body.results[0].context.error).toContain('config boom')
  })

  it('keeps serverFn throws as a normalized fail result', async () => {
    const mw = createScenetestMiddleware(
      stubServer({
        'check-1': () => {
          throw new Error('kaboom')
        },
      }),
      tmp
    )

    const res = await callRun(mw, { id: 'check-1', title: 'Thrower', data: null })
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.results[0].type).toBe('fail')
    expect(body.results[0].description).toBe('Thrower: serverFn threw an error')
    expect(body.results[0].context.error).toBe('kaboom')
  })
})

describe('POST /__scenetest/run via the Environments API module runner', () => {
  let tmp: string
  let vite: ViteDevServer | undefined

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-runner-'))
    clearConfigCache()
  })

  afterEach(async () => {
    clearRegistry()
    if (vite) {
      await vite.close()
      vite = undefined
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('loads the virtual module through the module runner, including after invalidation', async () => {
    vite = await createServer({
      root: tmp,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
      plugins: [scenetest()],
    })

    // The devDep vite is 6.x, so the Environments API must be present —
    // otherwise this test silently stops covering the runner path.
    expect((vite as unknown as { environments?: { ssr?: unknown } }).environments?.ssr).toBeTruthy()

    // Prove the runner is used: the legacy path must never be hit.
    const ssrLoadSpy = vi
      .spyOn(vite, 'ssrLoadModule')
      .mockImplementation(async () => {
        throw new Error('ssrLoadModule should not be called when the module runner is available')
      })

    // Register after createServer — the plugin's buildStart clears the registry
    registerAssertions([
      {
        id: 'check-1',
        title: 'check-1',
        location: { file: path.join(tmp, 'app.tsx'), line: 1, column: 1 },
        serverFnBodyCode: 'should("data is 42", data === 42)',
        params: 'server, data',
      },
    ])

    const mw = createScenetestMiddleware(vite, tmp)

    const res1 = await callRun(mw, { id: 'check-1', title: 'Runner check', data: 42 })
    expect(res1.statusCode).toBe(200)
    const body1 = JSON.parse(res1.body)
    expect(body1.success).toBe(true)
    expect(body1.results).toHaveLength(1)
    expect(body1.results[0].type).toBe('pass')

    // Register a new assertion and invalidate the virtual module the same
    // way the plugin's transform hook does — the runner must pick up the
    // regenerated module, not serve a stale one.
    registerAssertions([
      {
        id: 'check-2',
        title: 'check-2',
        location: { file: path.join(tmp, 'app.tsx'), line: 2, column: 1 },
        serverFnBodyCode: 'should("signal helper exists", signal instanceof AbortSignal)',
        params: 'server, data',
      },
    ])
    const virtualMod = vite.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID)
    expect(virtualMod).toBeTruthy()
    vite.moduleGraph.invalidateModule(virtualMod!)

    const res2 = await callRun(mw, { id: 'check-2', title: 'Runner check 2', data: null })
    const body2 = JSON.parse(res2.body)
    expect(body2.success).toBe(true)
    expect(body2.results).toHaveLength(1)
    expect(body2.results[0].type).toBe('pass')

    expect(ssrLoadSpy).not.toHaveBeenCalled()
  }, 30000)
})
