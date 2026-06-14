import { describe, it, expect, vi } from 'vitest'
import type { RunEvent } from '@scenetest/protocol'
import type { ConnectionStatus, Transport } from '../../types.js'
import { createRunSource } from '../source.js'

/** A transport whose subscription we drive by hand. */
function fakeTransport() {
  let emit: ((e: RunEvent) => void) | null = null
  let setStatus: ((s: ConnectionStatus) => void) | null = null
  const unsubscribe = vi.fn()
  let subscribeCalls = 0

  const transport: Transport = {
    subscribe(onEvent, onStatus) {
      subscribeCalls++
      emit = onEvent
      setStatus = onStatus ?? null
      return unsubscribe
    },
    async sendCommand() {},
  }

  return {
    transport,
    emit: (e: RunEvent) => emit?.(e),
    setStatus: (s: ConnectionStatus) => setStatus?.(s),
    unsubscribe,
    get subscribeCalls() {
      return subscribeCalls
    },
  }
}

const runStart = (ts: number, sceneCount = 1): RunEvent => ({ type: 'run:start', timestamp: ts, sceneCount })
const sceneStart = (ts: number, name: string): RunEvent => ({
  type: 'scene:start',
  timestamp: ts,
  name,
  file: 'f',
  actors: [],
  teamIndex: 0,
  team: {},
})

describe('createRunSource', () => {
  it('opens one transport subscription no matter how many collections attach', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)

    source.subscribe(vi.fn())
    source.subscribe(vi.fn())
    source.subscribe(vi.fn())

    expect(t.subscribeCalls).toBe(1)
  })

  it('fans every event out to all subscribers', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    const a: RunEvent[] = []
    const b: RunEvent[] = []
    source.subscribe((e) => a.push(e))
    source.subscribe((e) => b.push(e))

    t.emit(runStart(1))
    t.emit(sceneStart(2, 'login'))

    expect(a.map((e) => e.type)).toEqual(['run:start', 'scene:start'])
    expect(b).toEqual(a)
  })

  it('replays the current run to a subscriber that attaches mid-run', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    source.subscribe(vi.fn())

    t.emit(runStart(1))
    t.emit(sceneStart(2, 'a'))

    const late: RunEvent[] = []
    source.subscribe((e) => late.push(e))
    expect(late.map((e) => e.type)).toEqual(['run:start', 'scene:start'])

    t.emit(sceneStart(3, 'b'))
    expect(late).toHaveLength(3)
  })

  it('retains history across runs so late subscribers replay every run', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    source.subscribe(vi.fn())

    t.emit(runStart(1))
    t.emit(sceneStart(2, 'old'))
    t.emit(runStart(10))
    t.emit(sceneStart(11, 'new'))

    const late: RunEvent[] = []
    source.subscribe((e) => late.push(e))
    expect(late.map((e) => (e.type === 'scene:start' ? e.name : e.type))).toEqual([
      'run:start',
      'old',
      'run:start',
      'new',
    ])
  })

  it('reports status changes and the current status to new subscribers', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    const seen: ConnectionStatus[] = []
    source.subscribe(vi.fn(), (s) => seen.push(s))

    t.setStatus('connected')
    expect(source.status).toBe('connected')

    const seenLate: ConnectionStatus[] = []
    source.subscribe(vi.fn(), (s) => seenLate.push(s))
    expect(seenLate[0]).toBe('connected')
  })

  it('unsubscribe stops delivery to that consumer only', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    const a: RunEvent[] = []
    const b: RunEvent[] = []
    const off = source.subscribe((e) => a.push(e))
    source.subscribe((e) => b.push(e))

    t.emit(runStart(1))
    off()
    t.emit(sceneStart(2, 'x'))

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(2)
  })

  it('keeps the transport open after the last collection detaches', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    const off = source.subscribe(vi.fn())
    off()
    expect(t.unsubscribe).not.toHaveBeenCalled()
  })

  it('close tears down the transport subscription and ignores later subscribers', () => {
    const t = fakeTransport()
    const source = createRunSource(t.transport)
    source.subscribe(vi.fn())
    source.close()
    expect(t.unsubscribe).toHaveBeenCalledOnce()

    const after: RunEvent[] = []
    source.subscribe((e) => after.push(e))
    t.emit(runStart(1))
    expect(after).toHaveLength(0)
  })
})
