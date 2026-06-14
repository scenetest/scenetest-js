import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createScenetestMiddleware } from '../middleware.js'

// The dashboard under /__scenetest is the built app (a real Vite app,
// app/ → dist-app), served as static files — no importmap, no vendored modules,
// no per-file widget serving. Views are served as index.html; built assets live
// under /__scenetest/assets/. We point `appDir` at a fixture so the unit test
// doesn't need a real Vite build; the actual bundle is covered by the package
// build + e2e. The browser-side mount is covered by the dashboard's own tests.

function stubServer(): any {
  return {
    ssrLoadModule: async () => ({ assertions: {} }),
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  }
}

let tmpRoot: string
let appDir: string
let server: http.Server
let baseUrl: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-dash-'))
  // A fake built app: an index.html and one hashed asset under the base.
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-app-'))
  fs.writeFileSync(
    path.join(appDir, 'index.html'),
    '<!doctype html><div id="root"></div><script type="module" src="/__scenetest/assets/main.js"></script>'
  )
  fs.mkdirSync(path.join(appDir, 'assets'))
  fs.writeFileSync(path.join(appDir, 'assets', 'main.js'), 'export const mounted = true')

  const middleware = createScenetestMiddleware(stubServer(), tmpRoot, { appDir })
  server = http.createServer((req, res) => {
    void middleware(req, res, () => {
      res.statusCode = 404
      res.end('not handled')
    })
  })
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      resolve()
    })
  })
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  fs.rmSync(appDir, { recursive: true, force: true })
})

describe('dashboard: built app served as static files', () => {
  it('serves the built index.html at every view route', async () => {
    // One SPA serves Home / Runner / Waterfall; the client routes by pathname.
    const views = [
      '/__scenetest',
      '/__scenetest/',
      '/__scenetest/runner',
      '/__scenetest/runner/',
      '/__scenetest/waterfall',
      '/__scenetest/waterfall/',
      '/__scenetest/?run=report-x',
    ]
    for (const url of views) {
      const res = await fetch(`${baseUrl}${url}`)
      expect(res.status, url).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      expect(await res.text()).toContain('<div id="root">')
    }
  })

  it('serves built assets under /__scenetest/assets with the right content-type', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/assets/main.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(await res.text()).toContain('mounted')
  })

  it('404s a missing asset', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/assets/nope.js`)
    expect(res.status).toBe(404)
  })

  it('blocks path traversal outside the app dir', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/assets/..%2f..%2f..%2fpackage.json`)
    expect([403, 404]).toContain(res.status)
  })
})
