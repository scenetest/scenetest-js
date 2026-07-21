import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createScenetestMiddleware } from '../middleware.js'

// The dev command path: POST /__scenetest/commands delegates to the receiver
// core's /commands route, which decodes the protocol Command and dispatches it
// to the middleware's child-process actuation (shared with the legacy
// /replay /stop /pause endpoints). We exercise only the no-op commands here
// (stop/pause/resume with no active replay) so the test never spawns a CLI.

function stubServer(): any {
  return {
    ssrLoadModule: async () => ({ assertions: {} }),
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  }
}

let tmpRoot: string
let httpServer: http.Server
let baseUrl: string

function startServer(): Promise<void> {
  const middleware = createScenetestMiddleware(stubServer(), tmpRoot, {})
  httpServer = http.createServer((req, res) => {
    void middleware(req, res, () => {
      res.statusCode = 404
      res.end('not handled')
    })
  })
  return new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
      resolve()
    })
  })
}

function postCommand(body: string): Promise<Response> {
  return fetch(`${baseUrl}/__scenetest/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-commands-'))
})

afterEach(async () => {
  httpServer.closeAllConnections()
  await new Promise((resolve) => httpServer.close(resolve))
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('commands path through the receiver core', () => {
  it('accepts valid run-agnostic commands (wrapped or bare) with 200 ok:true', async () => {
    await startServer()
    // No active replay, so stop/pause/resume are safe no-ops on the actuation.
    const bodies = [
      JSON.stringify({ command: { type: 'run:stop' }, runId: '1700000000000' }),
      JSON.stringify({ command: { type: 'run:pause' } }),
      JSON.stringify({ type: 'run:resume' }), // bare command, no envelope
    ]
    for (const body of bodies) {
      const res = await postCommand(body)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    }
  })

  it('rejects malformed and unknown commands with 200 ok:false', async () => {
    await startServer()
    for (const body of ['{not json', '{"command":{"type":"run:explode"}}', '{"command":42}', 'null']) {
      const res = await postCommand(body)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: false })
    }
  })
})
