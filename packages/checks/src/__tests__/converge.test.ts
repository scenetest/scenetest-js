import { describe, it, expect } from 'vitest'
import { createConverger, type ConvergeDeps } from '../converge.js'
import type { AssertionResult } from '../types.js'

/**
 * A tiny virtual clock — real fake timers would work too, but this makes
 * the ordering between "observe" and "time passes" trivial to read in
 * each test.
 */
function harness() {
  const reports: AssertionResult[] = []
  type Timer = { id: number; at: number; fn: () => void }
  const timers: Timer[] = []
  let nextId = 1
  let currentTime = 0

  const deps: ConvergeDeps = {
    now: () => currentTime,
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.push({ id, at: currentTime + ms, fn })
      return id
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
    report: (r) => reports.push(r),
  }

  function tick(ms: number) {
    const target = currentTime + ms
    while (true) {
      const next = timers.reduce<Timer | null>(
        (acc, t) => (t.at <= target && (!acc || t.at < acc.at) ? t : acc),
        null
      )
      if (!next) break
      currentTime = next.at
      timers.splice(timers.indexOf(next), 1)
      next.fn()
    }
    currentTime = target
  }

  return { deps, reports, tick, pendingTimers: () => timers.length }
}

describe('createConverger — single pair', () => {
  it('passes immediately when values already match on first observation', () => {
    const h = harness()
    const c = createConverger('cart syncs', {}, {}, h.deps)
    c.observe([[5, 5]])
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({
      type: 'pass',
      description: 'cart syncs',
      result: true,
    })
    expect(h.reports[0].context).toMatchObject({ convergedInMs: 0 })
  })

  it('passes with the elapsed time when values converge mid-window', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    expect(h.reports).toHaveLength(0)
    h.tick(500)
    c.observe([[5, 5]])
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'pass' })
    expect(h.reports[0].context).toMatchObject({ convergedInMs: 500 })
    expect(h.pendingTimers()).toBe(0)
  })

  it('fails with a {client, target} diff when the window elapses', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    h.tick(2500)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail', result: false })
    expect(h.reports[0].context).toMatchObject({
      client: 5,
      target: 4,
      timeoutMs: 2000,
    })
  })

  it('reports fail with the LATEST values, not the ones seen at window start', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    h.tick(1000)
    c.observe([[5, 6]])
    h.tick(2000)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0].context).toMatchObject({ client: 5, target: 6 })
  })

  it('starts a fresh window when the client value (pair[0]) changes', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    h.tick(1500)
    c.observe([[9, 8]])
    h.tick(1500)
    expect(h.reports).toHaveLength(0)
    h.tick(1000)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
    expect(h.reports[0].context).toMatchObject({ client: 9, target: 8 })
  })

  it('does not re-resolve after passing, even if values later diverge', () => {
    const h = harness()
    const c = createConverger('cart syncs', {}, {}, h.deps)
    c.observe([[5, 5]])
    expect(h.reports).toHaveLength(1)
    c.observe([[5, 6]])
    c.observe([[5, 5]])
    h.tick(5000)
    expect(h.reports).toHaveLength(1)
  })

  it('leaves no timer pending after passing', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    expect(h.pendingTimers()).toBe(1)
    c.observe([[5, 5]])
    expect(h.pendingTimers()).toBe(0)
  })

  it('dispose() clears a pending timer', () => {
    const h = harness()
    const c = createConverger('cart syncs', { timeout: 2000 }, {}, h.deps)
    c.observe([[5, 4]])
    expect(h.pendingTimers()).toBe(1)
    c.dispose()
    expect(h.pendingTimers()).toBe(0)
    h.tick(5000)
    expect(h.reports).toHaveLength(0)
  })

  it('defaults timeout to 2000ms when not specified', () => {
    const h = harness()
    const c = createConverger('cart syncs', {}, {}, h.deps)
    c.observe([[5, 4]])
    h.tick(1999)
    expect(h.reports).toHaveLength(0)
    h.tick(2)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
    expect(h.reports[0].context).toMatchObject({ timeoutMs: 2000 })
  })
})

describe('createConverger — multiple pairs', () => {
  it('passes only when every pair matches', () => {
    const h = harness()
    const c = createConverger('all fields sync', { timeout: 2000 }, {}, h.deps)
    c.observe([
      [1, 1],
      [2, 3],
    ])
    expect(h.reports).toHaveLength(0)
    h.tick(500)
    c.observe([
      [1, 1],
      [2, 2],
    ])
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'pass' })
  })

  it('fails with only the unmatched pairs in a `mismatches` list', () => {
    const h = harness()
    const c = createConverger('all fields sync', { timeout: 1000 }, {}, h.deps)
    c.observe([
      ['a', 'a'],
      ['b', 'c'],
      [4, 5],
    ])
    h.tick(1500)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
    expect(h.reports[0].context).toMatchObject({
      mismatches: [
        { index: 1, client: 'b', target: 'c' },
        { index: 2, client: 4, target: 5 },
      ],
      timeoutMs: 1000,
    })
  })

  it('starts a fresh window when ANY client value changes', () => {
    const h = harness()
    const c = createConverger('all fields sync', { timeout: 2000 }, {}, h.deps)
    c.observe([
      [1, 2],
      [3, 4],
    ])
    h.tick(1500)
    // Only pair[1][0] changed — should still restart.
    c.observe([
      [1, 2],
      [99, 4],
    ])
    h.tick(1500)
    expect(h.reports).toHaveLength(0)
    h.tick(1000)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
  })

  it('treats a fresh array of the same client values as the same window', () => {
    const h = harness()
    const c = createConverger('all fields sync', { timeout: 2000 }, {}, h.deps)
    c.observe([
      [1, 2],
      [3, 4],
    ])
    h.tick(1000)
    // Same client values in a brand-new array — no window reset.
    c.observe([
      [1, 2],
      [3, 4],
    ])
    h.tick(1500)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
    // Elapsed reflects the ORIGINAL window start.
    expect(h.reports[0].context).toMatchObject({ elapsedMs: 2000 })
  })
})

describe('createConverger — resetKey', () => {
  it('opens a new window when the explicit resetKey changes', () => {
    const h = harness()
    const c = createConverger('title', { timeout: 2000 }, {}, h.deps)
    c.observe([[1, 2]], { resetKey: 'v1' })
    h.tick(1500)
    c.observe([[1, 2]], { resetKey: 'v2' })
    h.tick(1500)
    expect(h.reports).toHaveLength(0)
    h.tick(1000)
    expect(h.reports).toHaveLength(1)
  })

  it('holds the same window when resetKey is unchanged even if client values change', () => {
    const h = harness()
    const c = createConverger('title', { timeout: 2000 }, {}, h.deps)
    c.observe([[1, 2]], { resetKey: 'stable' })
    h.tick(1500)
    // Different client value, but resetKey is stable — no restart.
    c.observe([[9, 2]], { resetKey: 'stable' })
    h.tick(1000)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]).toMatchObject({ type: 'fail' })
  })
})
