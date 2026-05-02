import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createScenetestMiddleware } from '../middleware.js'

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

describe('scenetest middleware', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-mw-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  describe('GET /__scenetest/', () => {
    it('returns the analyze app HTML at the bare path', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('<!DOCTYPE html>')
      expect(res.body).toContain('importmap')
    })

    it('handles /__scenetest (no trailing slash)', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest')
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('<!DOCTYPE html>')
    })

    it('handles /__scenetest/?run=foo', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/?run=report-x')
      expect(res.statusCode).toBe(200)
    })
  })

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

  describe('GET /__scenetest/vendor/:name', () => {
    it('serves preact ESM as JavaScript', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/vendor/preact.js')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('javascript')
      // Sanity: real preact bundle contains its export footer
      expect(res.body).toMatch(/export\{/)
    })

    it('serves preact-hooks ESM', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/vendor/preact-hooks.js')
      expect(res.statusCode).toBe(200)
      // hooks bundle imports from "preact" via bare specifier
      expect(res.body).toContain('from"preact"')
    })

    it('serves htm ESM', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/vendor/htm.js')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('javascript')
    })

    it('returns 404 for unknown vendor names', async () => {
      const mw = createScenetestMiddleware(stubServer(), tmp)
      const res = await call(mw, 'GET', '/__scenetest/vendor/react.js')
      expect(res.statusCode).toBe(404)
    })
  })
})
