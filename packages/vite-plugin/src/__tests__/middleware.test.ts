import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { spawn } from 'child_process'
import { createScenetestMiddleware } from '../middleware.js'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Dev-server methods used by the middleware. Only `/__scenetest/run` reads
// from the server (ssrLoadModule). The routes under test don't, so a thin
// stub is enough.
function stubServer(): any {
  return {
    ssrLoadModule: async () => ({ assertions: {} }),
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  }
}

interface MockResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  ended: boolean
  end: (chunk?: string) => void
  setHeader: (k: string, v: string) => void
  writeHead: (...args: unknown[]) => void
  write: (chunk: string) => void
  on: () => void
}

function mockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    end(chunk) {
      if (typeof chunk === 'string') res.body += chunk
      res.ended = true
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v
    },
    writeHead() {},
    write(chunk) {
      res.body += chunk
    },
    on() {},
  }
  return res
}

async function call(
  mw: ReturnType<typeof createScenetestMiddleware>,
  method: string,
  url: string
): Promise<MockResponse> {
  const res = mockRes()
  let nextCalled = false
  await mw(
    { method, url, headers: {} } as never,
    res as never,
    () => {
      nextCalled = true
      res.statusCode = res.statusCode || 0
      res.ended = true
    }
  )
  // For routes that delegate to next() the test treats that as "no match"
  if (nextCalled && !res.statusCode) res.statusCode = -1
  return res
}

async function callWithBody(
  mw: ReturnType<typeof createScenetestMiddleware>,
  method: string,
  url: string,
  body: string
): Promise<MockResponse> {
  const res = mockRes()
  const req = Readable.from([body]) as unknown as Record<string, unknown>
  ;(req as { method: string }).method = method
  ;(req as { url: string }).url = url
  ;(req as { headers: Record<string, string> }).headers = {}
  await mw(req as never, res as never, () => {})
  return res
}

describe('scenetest middleware', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-mw-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  // The console shell served at the view routes (/__scenetest, /runner,
  // /dashboard) + its assets is covered in middleware-dashboard.test.ts
  // against a fixture appDir, so it needs no real Vite build.

  describe('GET /__scenetest/runs', () => {
    it('returns an empty list when reportsDir does not exist', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/runs')
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.runs).toEqual([])
      expect(body.reportsDir).toContain('.reports')
    })

    it('lists JSON files (newest first), skipping non-json', async () => {
      const reports = path.join(tmp, 'reports')
      fs.mkdirSync(reports, { recursive: true })
      fs.writeFileSync(path.join(reports, 'report-old.json'), '{}')
      fs.writeFileSync(path.join(reports, 'report-new.json'), '{}')
      // Touch order: ensure 'new' has a strictly later mtime
      fs.utimesSync(path.join(reports, 'report-old.json'), 1000, 1000)
      fs.utimesSync(path.join(reports, 'report-new.json'), 2000, 2000)
      fs.writeFileSync(path.join(reports, 'README.txt'), 'ignored')

      const mw = createScenetestMiddleware(stubServer(), tmp, { reportsDir: 'reports' })
      const res = await call(mw, 'GET', '/__scenetest/runs')
      const body = JSON.parse(res.body)
      expect(body.runs.map((r: { id: string }) => r.id)).toEqual(['report-new', 'report-old'])
    })
  })

  describe('GET /__scenetest/runs/:id', () => {
    it('returns the JSON content of a report', async () => {
      const reports = path.join(tmp, 'reports')
      fs.mkdirSync(reports, { recursive: true })
      const payload = { hello: 'world' }
      fs.writeFileSync(path.join(reports, 'report-2026-01-01.json'), JSON.stringify(payload))

      const mw = createScenetestMiddleware(stubServer(), tmp, { reportsDir: 'reports' })
      const res = await call(mw, 'GET', '/__scenetest/runs/report-2026-01-01')
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual(payload)
    })

    it('rejects path traversal attempts', async () => {
      const reports = path.join(tmp, 'reports')
      fs.mkdirSync(reports, { recursive: true })
      fs.writeFileSync(path.join(tmp, 'secrets.json'), '{}')

      const mw = createScenetestMiddleware(stubServer(), tmp, { reportsDir: 'reports' })
      // path.basename strips slashes anyway, but the regex guard catches '..' too
      const res = await call(mw, 'GET', '/__scenetest/runs/' + encodeURIComponent('../secrets'))
      expect(res.statusCode).toBe(404)
    })

    it('returns 404 for missing reports', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/runs/nope')
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /__scenetest/source', () => {
    it('returns a window of lines around the requested line', async () => {
      const file = path.join(tmp, 'sample.ts')
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`)
      fs.writeFileSync(file, lines.join('\n'))

      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/source?file=' +
        encodeURIComponent(file) + '&line=20&context=3')
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.start).toBe(17)
      expect(body.end).toBe(23)
      expect(body.lines).toEqual([
        'line 17', 'line 18', 'line 19', 'line 20', 'line 21', 'line 22', 'line 23',
      ])
    })

    it('refuses files outside the project root', async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-out-'))
      const file = path.join(outside, 'leak.ts')
      fs.writeFileSync(file, 'secret')
      try {
        const mw = createScenetestMiddleware(stubServer(), tmp)
        const res = await call(mw, 'GET', '/__scenetest/source?file=' +
          encodeURIComponent(file) + '&line=1')
        expect(res.statusCode).toBe(404)
      } finally {
        fs.rmSync(outside, { recursive: true, force: true })
      }
    })
  })

  describe('POST /__scenetest/replay', () => {
    const fakeChild = { exitCode: null, kill: vi.fn(), on: vi.fn() }

    beforeEach(() => {
      vi.mocked(spawn).mockReset()
      vi.mocked(spawn).mockReturnValue(fakeChild as never)
    })

    it('passes --team <name> to the runner when team is provided', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await callWithBody(mw, 'POST', '/__scenetest/replay', '{"team":"French Content"}')
      expect(res.statusCode).toBe(200)
      expect(spawn).toHaveBeenCalledTimes(1)
      const args = vi.mocked(spawn).mock.calls[0][1] as string[]
      expect(args).toContain('--team')
      const teamIdx = args.indexOf('--team')
      expect(args[teamIdx + 1]).toBe('French Content')
    })

    it('omits --team when no team is provided', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await callWithBody(mw, 'POST', '/__scenetest/replay', '{}')
      expect(res.statusCode).toBe(200)
      const args = vi.mocked(spawn).mock.calls[0][1] as string[]
      expect(args).not.toContain('--team')
    })

    it('places --team before the resolved scene file path', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await callWithBody(
        mw,
        'POST',
        '/__scenetest/replay',
        '{"team":"Spanish","file":"login.spec.ts"}'
      )
      expect(res.statusCode).toBe(200)
      const args = vi.mocked(spawn).mock.calls[0][1] as string[]
      // spawn('npx', ['scenetest', ...args]) — drop the leading 'scenetest'
      expect(args[0]).toBe('scenetest')
      expect(args[1]).toBe('--team')
      expect(args[2]).toBe('Spanish')
      expect(args[3]).toContain('login.spec.ts')
      expect(args[3]).toContain(path.join('scenetest', 'scenes'))
    })
  })
})
