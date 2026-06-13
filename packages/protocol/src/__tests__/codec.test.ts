import { describe, expect, it } from 'vitest'
import {
  decodeCommand,
  decodeEvent,
  encodeCommand,
  encodeEvent,
  isEventShaped,
  isRunEvent,
  type Command,
  type RunEvent,
} from '../index.js'

const events: RunEvent[] = [
  { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 3 },
  {
    type: 'scene:start',
    timestamp: 2,
    runId: '1',
    name: 'checkout',
    file: 'checkout.scene.ts',
    actors: ['buyer', 'seller'],
    teamIndex: 0,
    team: { name: 'fr', tags: { locale: 'fr' } },
  },
  { type: 'action:start', timestamp: 3, runId: '1', actor: 'buyer', action: 'click', target: 'submit' },
  { type: 'action:end', timestamp: 4, runId: '1', actor: 'buyer', action: 'click', target: 'submit', duration: 12 },
  { type: 'assertion', timestamp: 5, runId: '1', actor: 'buyer', description: 'cart updated', result: true },
  { type: 'warning', timestamp: 6, runId: '1', actor: 'buyer', selector: '~banner', message: 'unexpected path' },
  {
    type: 'scene:end',
    timestamp: 7,
    runId: '1',
    name: 'checkout',
    status: 'completed',
    duration: 900,
    teamIndex: 0,
    team: {},
  },
  { type: 'run:progress', timestamp: 8, runId: '1', pct: 60, failing: 1, flaky: 1 },
  {
    type: 'run:end',
    timestamp: 9,
    runId: '1',
    duration: 1000,
    summary: {
      scenes: 3,
      completed: 2,
      failed: 1,
      assertions: { total: 10, passed: 9, failed: 1 },
      warnings: 1,
      consoleErrors: 0,
    },
  },
]

const commands: Command[] = [
  { type: 'run:replay' },
  { type: 'run:replay', file: 'checkout.scene.ts', team: 'fr' },
  { type: 'run:stop' },
  { type: 'run:pause' },
  { type: 'run:resume' },
]

describe('event codec', () => {
  it('round-trips every event type', () => {
    for (const event of events) {
      expect(decodeEvent(encodeEvent(event))).toEqual(event)
    }
  })

  it('decodes already-parsed values', () => {
    expect(decodeEvent(events[0])).toEqual(events[0])
  })

  it('rejects malformed JSON without throwing', () => {
    expect(decodeEvent('{not json')).toBeNull()
  })

  it('rejects unknown event types', () => {
    expect(decodeEvent({ type: 'run:imaginary', timestamp: 1 })).toBeNull()
  })

  it('rejects known types missing required fields', () => {
    expect(decodeEvent({ type: 'run:start', timestamp: 1, runId: '1' })).toBeNull()
    expect(decodeEvent({ type: 'assertion', timestamp: 1, runId: '1', description: 'x' })).toBeNull()
    expect(decodeEvent({ type: 'scene:end', timestamp: 1, runId: '1', name: 'a', status: 'completed', duration: 1, teamIndex: 0, team: { tags: { a: 1 } } })).toBeNull()
  })

  it('rejects events missing runId (required on every event, like name/file)', () => {
    expect(decodeEvent({ type: 'run:start', timestamp: 1, sceneCount: 3 })).toBeNull()
    expect(decodeEvent({ type: 'assertion', timestamp: 5, actor: 'a', description: 'x', result: true })).toBeNull()
    // …but the lenient relay envelope still forwards it (it only checks type+timestamp).
    expect(isEventShaped({ type: 'assertion', timestamp: 5, description: 'x', result: true })).toBe(true)
  })

  it('rejects events without a timestamp', () => {
    expect(decodeEvent({ type: 'run:start', sceneCount: 1 })).toBeNull()
  })

  it('tolerates unknown extra fields (additive changes are non-breaking)', () => {
    const withExtra = { ...events[0], futureField: 'x' }
    expect(decodeEvent(withExtra)).toEqual(withExtra)
  })

  it('isEventShaped passes unknown event types through for relays', () => {
    const future = { type: 'run:imaginary', timestamp: 1, payload: {} }
    expect(isEventShaped(future)).toBe(true)
    expect(isRunEvent(future)).toBe(false)
    expect(isEventShaped({ type: 'run:start' })).toBe(false)
    expect(isEventShaped('run:start')).toBe(false)
  })
})

describe('command codec', () => {
  it('round-trips every command type', () => {
    for (const command of commands) {
      expect(decodeCommand(encodeCommand(command))).toEqual(command)
    }
  })

  it('rejects unknown command types and bad fields', () => {
    expect(decodeCommand({ type: 'run:selfdestruct' })).toBeNull()
    expect(decodeCommand({ type: 'run:replay', team: 42 })).toBeNull()
    expect(decodeCommand('{not json')).toBeNull()
  })
})
