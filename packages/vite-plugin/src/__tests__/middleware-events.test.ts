import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createScenetestMiddleware } from '../middleware.js'

// End-to-end coverage of the events path now that POST /__scenetest/events
// delegates to @scenetest/receiver: the refactor's acceptance bar is "dev
// behavior observably unchanged", so exercise it over real HTTP exactly as
// the CLI's DashboardReporter and the dashboard's EventSource do.

function stubServer(): any {
  return {
    ssrLoadModule: async () => ({ assertions: {} }),
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
  }
}

let tmpRoot: string
let httpServer: http.Server
let baseUrl: string

function startServer(options: Parameters<typeof createScenetestMiddleware>[2] = {}): Promise<void> {
  const middleware = createScenetestMiddleware(stubServer(), tmpRoot, options)
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

function postEvent(body: string): Promise<Response> {
  return fetch(`${baseUrl}/__scenetest/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

/** Connect to the SSE stream and collect `count` replayed events. */
async function readSseReplay(count: number): Promise<Array<Record<string, unknown>>> {
  const controller = new AbortController()
  const res = await fetch(`${baseUrl}/__scenetest/events`, { signal: controller.signal })
  expect(res.headers.get('content-type')).toBe('text/event-stream')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events: Array<Record<string, unknown>> = []
  while (events.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = frame.replace(/^data: /, '')
      events.push(JSON.parse(data))
    }
  }
  controller.abort()
  return events
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scenetest-events-'))
})

afterEach(async () => {
  httpServer.closeAllConnections()
  await new Promise((resolve) => httpServer.close(resolve))
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('events path through the receiver core', () => {
  it('accepts protocol events and replays them to a late-joining SSE client', async () => {
    await startServer()
    const assertion = { type: 'assertion', timestamp: 1, description: 'works', result: true }
    const future = { type: 'hologram:flicker', timestamp: 2, intensity: 0.7 }

    expect(await (await postEvent(JSON.stringify(assertion))).json()).toEqual({ ok: true })
    // Unknown future event types must relay (old plugin + newer CLI).
    expect(await (await postEvent(JSON.stringify(future))).json()).toEqual({ ok: true })

    expect(await readSseReplay(2)).toEqual([assertion, future])
  })

  it('rejects malformed and non-event bodies with 200 ok:false and buffers nothing', async () => {
    await startServer()
    for (const body of ['{not json', '"just a string"', '{"type":"x"}']) {
      const res = await postEvent(body)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: false })
    }

    await postEvent(JSON.stringify({ type: 'assertion', timestamp: 9, result: true }))
    const replay = await readSseReplay(1)
    expect(replay).toHaveLength(1)
    expect(replay[0].timestamp).toBe(9)
  })

  it('clears the SSE buffer on run:start so the dashboard starts fresh', async () => {
    await startServer()
    await postEvent(JSON.stringify({ type: 'assertion', timestamp: 1, result: true }))
    await postEvent(JSON.stringify({ type: 'run:start', timestamp: 2, sceneCount: 1 }))

    expect(await readSseReplay(1)).toEqual([{ type: 'run:start', timestamp: 2, sceneCount: 1 }])
  })

  it('flushes SSE headers immediately and sends no Access-Control-Allow-Origin', async () => {
    await startServer()
    // No events posted: headers must arrive even with an empty buffer
    // (a browser EventSource opened before any run).
    const controller = new AbortController()
    const res = await fetch(`${baseUrl}/__scenetest/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    controller.abort()
  })

  it('writes one protocol event per line when the jsonl option is on', async () => {
    await startServer({ jsonl: true })
    const events = [
      { type: 'run:start', timestamp: 1, sceneCount: 1 },
      { type: 'assertion', timestamp: 2, description: 'ok', result: true },
    ]
    for (const event of events) {
      await postEvent(JSON.stringify(event))
    }

    const jsonlPath = path.join(tmpRoot, 'scenetest', '.reports', 'events.jsonl')
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n')
    expect(lines.map((l) => JSON.parse(l))).toEqual(events)
  })
})
