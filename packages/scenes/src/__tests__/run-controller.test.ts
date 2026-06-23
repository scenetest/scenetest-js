import { describe, it, expect } from 'vitest'
import { RunController } from '../run-controller.js'

describe('RunController', () => {
  it('starts running and gate() returns immediately', async () => {
    const c = new RunController()
    expect(c.current).toBe('running')
    expect(c.isStopped).toBe(false)
    await expect(c.gate()).resolves.toBeUndefined()
  })

  it('pause parks gate() until resume', async () => {
    const c = new RunController()
    c.dispatch({ type: 'run:pause' })
    expect(c.isPaused).toBe(true)

    let released = false
    const parked = c.gate().then(() => {
      released = true
    })

    await Promise.resolve()
    expect(released).toBe(false)

    c.dispatch({ type: 'run:resume' })
    await parked
    expect(released).toBe(true)
    expect(c.current).toBe('running')
  })

  it('stop releases a parked gate and marks the run stopped', async () => {
    const c = new RunController()
    c.pause()
    const parked = c.gate()
    c.dispatch({ type: 'run:stop' })
    await expect(parked).resolves.toBeUndefined()
    expect(c.isStopped).toBe(true)
    await expect(c.gate()).resolves.toBeUndefined()
  })

  it('stop is terminal; pause/resume are ignored once stopped', () => {
    const c = new RunController()
    c.stop()
    c.stop()
    c.dispatch({ type: 'run:pause' })
    c.dispatch({ type: 'run:resume' })
    expect(c.current).toBe('stopped')
  })

  it('fires onPaused/onResumed only on real transitions', () => {
    const calls: string[] = []
    const c = new RunController({
      onPaused: () => calls.push('paused'),
      onResumed: () => calls.push('resumed'),
    })

    c.dispatch({ type: 'run:resume' }) // not paused — no-op
    c.dispatch({ type: 'run:pause' })
    c.dispatch({ type: 'run:pause' }) // already paused — no-op
    c.dispatch({ type: 'run:resume' })
    c.dispatch({ type: 'run:resume' }) // already running — no-op

    expect(calls).toEqual(['paused', 'resumed'])
  })

  it('treats run:replay as a no-op (replay is a relaunch, not in-process)', () => {
    const c = new RunController()
    c.dispatch({ type: 'run:replay', file: 'chat.spec.ts' })
    expect(c.current).toBe('running')
  })

  it('ignores runId metadata — commands act on the active run regardless', () => {
    const c = new RunController()
    c.dispatch({ type: 'run:pause' }, { runId: '1700000000000' })
    expect(c.isPaused).toBe(true)
    c.dispatch({ type: 'run:resume' }, {})
    expect(c.current).toBe('running')
  })
})
