import { describe, it, expect } from 'vitest'
import { createCollection, createLiveQueryCollection, count } from '@tanstack/db'
import type { RunEvent } from '@scenetest/protocol'
import type { Transport } from '../../types.js'
import { createRunModel } from '../model.js'
import { runCollectionOptions } from '../options.js'
import { createRunSource } from '../source.js'
import { scenesProjection } from '../projections.js'

/** A transport we drive by hand. */
function fakeTransport() {
  let emit: ((e: RunEvent) => void) | null = null
  const transport: Transport = {
    async fetchState() {
      return []
    },
    subscribe(onEvent) {
      emit = onEvent
      return () => {
        emit = null
      }
    },
    async sendCommand() {},
  }
  return { transport, emit: (e: RunEvent) => emit?.(e) }
}

const sceneStart = (name: string, ts: number): RunEvent => ({
  type: 'scene:start',
  timestamp: ts,
  name,
  file: `${name}.ts`,
  actors: ['a'],
  teamIndex: 0,
  team: {},
})
const sceneEnd = (name: string, status: string, ts: number): RunEvent => ({
  type: 'scene:end',
  timestamp: ts,
  name,
  status,
  duration: ts,
  teamIndex: 0,
  team: {},
})

describe('run collection (end to end through @tanstack/db)', () => {
  it('folds the stream into queryable scene and assertion rows', async () => {
    const { transport, emit } = fakeTransport()
    const { scenes, assertions } = createRunModel(transport)
    await scenes.preload()
    await assertions.preload()

    emit({ type: 'run:start', timestamp: 1, sceneCount: 2 })
    emit(sceneStart('login', 2))
    emit({ type: 'assertion', timestamp: 3, actor: 'a', description: 'ok', result: true })
    emit(sceneEnd('login', 'completed', 40))

    expect(scenes.get('0:login')).toMatchObject({ status: 'completed', duration: 40 })
    expect(assertions.toArray.map((r) => r.description)).toEqual(['ok'])
  })

  it('shares one transport subscription across both collections', async () => {
    let subscribeCalls = 0
    const transport: Transport = {
      async fetchState() {
        return []
      },
      subscribe() {
        subscribeCalls++
        return () => {}
      },
      async sendCommand() {},
    }
    const model = createRunModel(transport)
    // Preloading starts each collection's sync, which attaches to the source.
    await model.scenes.preload()
    await model.assertions.preload()
    expect(subscribeCalls).toBe(1)
  })

  it('recomputes a grouped aggregate incrementally as scenes finish', async () => {
    const { transport, emit } = fakeTransport()
    const source = createRunSource(transport)
    const scenes = createCollection(
      runCollectionOptions({ source, projection: scenesProjection() })
    )
    await scenes.preload()

    const byStatus = createLiveQueryCollection((q) =>
      q
        .from({ s: scenes })
        .groupBy(({ s }) => s.status)
        .select(({ s }) => ({ status: s.status, n: count(s.id) }))
    )
    await byStatus.preload()

    const counts = () =>
      Object.fromEntries(byStatus.toArray.map((r) => [r.status as string, r.n as number]))

    emit({ type: 'run:start', timestamp: 1, sceneCount: 2 })
    emit(sceneStart('a', 2))
    emit(sceneStart('b', 3))
    expect(counts()).toEqual({ running: 2 })

    emit(sceneEnd('a', 'completed', 10))
    expect(counts()).toEqual({ running: 1, completed: 1 })

    emit(sceneEnd('b', 'failed', 11))
    expect(counts()).toEqual({ completed: 1, failed: 1 })
  })

  it('catches a collection up via the source buffer when it attaches mid-run', async () => {
    const { transport, emit } = fakeTransport()
    const source = createRunSource(transport)
    // First collection starts the subscription and the run gets underway.
    const early = createCollection(runCollectionOptions({ source, projection: scenesProjection() }))
    await early.preload()
    emit({ type: 'run:start', timestamp: 1, sceneCount: 1 })
    emit(sceneStart('login', 2))

    // A second collection created mid-run replays the buffered events.
    const late = createCollection(runCollectionOptions({ source, projection: scenesProjection() }))
    await late.preload()
    expect(late.get('0:login')).toMatchObject({ name: 'login', status: 'running' })
  })

  it('rejects client writes — the projection is the sole writer', async () => {
    const { transport } = fakeTransport()
    const { scenes } = createRunModel(transport)
    await scenes.preload()
    expect(() =>
      scenes.insert({
        id: 'x',
        name: 'x',
        file: 'x',
        actors: [],
        status: 'running',
        startTime: 0,
        endTime: null,
        duration: null,
        error: null,
        team: {},
        teamIndex: 0,
      })
    ).toThrow()
  })
})
