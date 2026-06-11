import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createScenetestMiddleware } from '../middleware.js'

// The dashboard at /__scenetest/dashboard is now a thin shell that mounts the
// @scenetest/dashboard widget, whose built ESM (and its protocol dep) the
// middleware serves off disk under /__scenetest/widget/. Verify the shell and
// the module-serving route over real HTTP — the browser-side mount itself is
// covered by the widget package's own store tests plus build/typecheck.

function stubServer(): any {
  return {
    ssrLoadModule: async () => ({ assertions: {} }),
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  }
}

let tmpRoot: string
let server: http.Server
let baseUrl: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-dash-'))
  const middleware = createScenetestMiddleware(stubServer(), tmpRoot)
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
})

describe('dashboard shell and widget serving', () => {
  it('serves a shell that imports the widget and wires the dev transport', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/dashboard`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('type="importmap"')
    expect(html).toContain('"@scenetest/dashboard": "/__scenetest/widget/dashboard/index.js"')
    expect(html).toContain('"@scenetest/protocol": "/__scenetest/widget/protocol/index.js"')
    expect(html).toContain('mountDashboard')
    expect(html).toContain('createDevTransport')
  })

  it('serves the widget entry and its relative-imported modules as JS', async () => {
    for (const file of ['index.js', 'store.js', 'mount.js', 'dev-transport.js']) {
      const res = await fetch(`${baseUrl}/__scenetest/widget/dashboard/${file}`)
      expect(res.status, file).toBe(200)
      expect(res.headers.get('content-type')).toContain('javascript')
      expect((await res.text()).length).toBeGreaterThan(0)
    }
  })

  it('serves the protocol dep the widget imports by bare specifier', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/widget/protocol/index.js`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('export')
  })

  it('blocks path traversal outside a widget package dist dir', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/widget/dashboard/..%2f..%2f..%2fpackage.json`)
    expect([403, 404]).toContain(res.status)
  })

  it('404s an unknown widget package key', async () => {
    const res = await fetch(`${baseUrl}/__scenetest/widget/nonesuch/index.js`)
    expect(res.status).toBe(404)
  })
})
