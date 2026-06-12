import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReportUrlReporter } from '../report-url-reporter.js'
import type { DashboardEvent } from '../types.js'

const URL = 'http://127.0.0.1:4999/events/run-123'

function runStart(sceneCount = 1): DashboardEvent {
  return { type: 'run:start', timestamp: 1, sceneCount }
}

/** Decode every POST into a flat list of { seq, payload } envelopes. */
function postedEnvelopes(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.flatMap((call) => {
    const body = JSON.parse((call[1] as RequestInit).body as string)
    return body.events as { seq: number; payload: DashboardEvent }[]
  })
}

describe('ReportUrlReporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs to the configured URL with the { events: [{ seq, payload }] } shape', async () => {
    const reporter = new ReportUrlReporter({ url: URL })
    reporter.send(runStart())
    reporter.send({ type: 'run:end', timestamp: 2, duration: 5, summary: {
      scenes: 1, completed: 1, failed: 0,
      assertions: { total: 0, passed: 0, failed: 0 }, warnings: 0, consoleErrors: 0,
    } })
    await reporter.drain()

    expect(fetchMock).toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toBe(URL)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')

    const envelopes = postedEnvelopes(fetchMock)
    expect(envelopes.map((e) => e.seq)).toEqual([0, 1])
    expect(envelopes[0].payload.type).toBe('run:start')
    expect(envelopes[1].payload.type).toBe('run:end')
  })

  it('assigns monotonic seq across multiple flushes, in order', async () => {
    const reporter = new ReportUrlReporter({ url: URL, maxBatchSize: 2 })
    for (let i = 0; i < 5; i++) {
      reporter.send({ type: 'assertion', timestamp: i, description: `a${i}`, result: true })
    }
    await reporter.drain()

    // maxBatchSize 2 → flushes at 2, 4, then drain flushes the tail.
    const seqs = postedEnvelopes(fetchMock).map((e) => e.seq)
    expect(seqs).toEqual([0, 1, 2, 3, 4])
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  it('sends a bearer Authorization header only when a token is given', async () => {
    const withToken = new ReportUrlReporter({ url: URL, token: 'sekret' })
    withToken.send(runStart())
    await withToken.drain()
    let headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sekret')

    fetchMock.mockClear()
    const noToken = new ReportUrlReporter({ url: URL })
    noToken.send(runStart())
    await noToken.drain()
    headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('fails soft: a rejected fetch never throws and warns once', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const reporter = new ReportUrlReporter({ url: URL, maxBatchSize: 1 })
    reporter.send(runStart())
    reporter.send(runStart())
    await expect(reporter.drain()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns once on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const reporter = new ReportUrlReporter({ url: URL })
    reporter.send(runStart())
    await reporter.drain()

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drain with no queued events does not POST', async () => {
    const reporter = new ReportUrlReporter({ url: URL })
    await reporter.drain()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
