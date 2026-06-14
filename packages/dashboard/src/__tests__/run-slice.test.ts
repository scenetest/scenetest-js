import { describe, it, expect } from 'vitest'
import { createCollection } from '@tanstack/db'
import type { RunEvent } from '@scenetest/protocol'
import type { Transport } from '../types.js'
import { createRunSource } from '../collections/source.js'
import { runCollectionOptions } from '../collections/options.js'
import {
  scenesProjection,
  assertionsProjection,
  actionsProjection,
  runsProjection,
} from '../collections/projections.js'
import { latestRunId, latestRunSlice, type DashboardCollections } from '../select-helpers.js'
import { runSliceCollections } from '../use-run-slice.js'

/**
 * The live `useRunSlice` pushes the latest-run slice + ordering into
 * `@tanstack/db` live-query collections. This proves that path produces the
 * same slice the pure `latestRunSlice` does over the raw rows — so the selectors
 * (tested separately against `latestRunSlice`) see identical input either way.
 */

const team = { name: 't', index: 0 }

function sceneStart(name: string, t: number, runId: string): RunEvent {
  return { type: 'scene:start', runId, name, file: 'a.spec.ts', actors: ['a'], team, teamIndex: 0, timestamp: t }
}
function sceneEnd(name: string, status: string, t: number, runId: string): RunEvent {
  return { type: 'scene:end', runId, name, status, duration: 5, error: null, teamIndex: 0, team, timestamp: t }
}
function action(name: string, t: number, runId: string): RunEvent {
  return { type: 'action:start', runId, actor: 'a', action: name, target: 'x', timestamp: t }
}
function assertion(desc: string, t: number, runId: string): RunEvent {
  return { type: 'assertion', runId, actor: 'a', description: desc, result: true, timestamp: t }
}

/** A transport that replays a fixed event list synchronously on subscribe. */
function replayTransport(events: RunEvent[]): Transport {
  return {
    fetchState: async () => [],
    subscribe: (onEvent) => {
      for (const e of events) onEvent(e)
      return () => {}
    },
    sendCommand: async () => {},
  }
}

function buildCollections(events: RunEvent[]): DashboardCollections {
  const source = createRunSource(replayTransport(events))
  return {
    scenes: createCollection(runCollectionOptions({ source, projection: scenesProjection() })),
    assertions: createCollection(runCollectionOptions({ source, projection: assertionsProjection() })),
    actions: createCollection(runCollectionOptions({ source, projection: actionsProjection() })),
    runs: createCollection(runCollectionOptions({ source, projection: runsProjection() })),
  }
}

// Strip the `$`-prefixed TanStack DB metadata fields a live query attaches.
function plain<T extends object>(rows: T[]): T[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('$')) out[k] = v
    return out as T
  })
}

describe('runSliceCollections (live-query latest-run slice)', () => {
  // Two runs interleaved; only the latest (runId '10') should survive.
  const events: RunEvent[] = [
    { type: 'run:start', timestamp: 1, runId: '1', sceneCount: 1 },
    sceneStart('old', 2, '1'),
    action('clickOld', 3, '1'),
    assertion('old assert', 4, '1'),
    sceneEnd('old', 'completed', 5, '1'),
    { type: 'run:start', timestamp: 10, runId: '10', sceneCount: 2 },
    sceneStart('beta', 30, '10'),
    sceneStart('alpha', 20, '10'),
    action('clickAlpha', 21, '10'),
    assertion('alpha assert', 22, '10'),
  ]

  it('slices to the latest run and orders scenes/actions by startTime', () => {
    const collections = buildCollections(events)
    const runId = latestRunId(collections.runs.toArray)
    expect(runId).toBe('10')

    const live = runSliceCollections(collections, runId)
    // Subscribe to drive sync, then read.
    const subs = [live.scenes, live.assertions, live.actions].map((c) => c.subscribeChanges(() => {}))

    const reference = latestRunSlice(
      collections.scenes.toArray,
      collections.assertions.toArray,
      collections.actions.toArray,
      collections.runs.toArray
    )

    expect(plain(live.scenes.toArray)).toEqual(plain(reference.scenes))
    expect(live.scenes.toArray.map((s) => s.name)).toEqual(['alpha', 'beta']) // ordered by startTime
    expect(plain(live.assertions.toArray)).toEqual(plain(reference.assertions))
    expect(plain(live.actions.toArray)).toEqual(plain(reference.actions))
    // Nothing from the older run leaks through.
    expect(live.scenes.toArray.every((s) => s.runId === '10')).toBe(true)

    subs.forEach((s) => s.unsubscribe())
  })

  it('is empty before any run starts (undefined runId)', () => {
    const collections = buildCollections([])
    const live = runSliceCollections(collections, latestRunId(collections.runs.toArray))
    const subs = [live.scenes, live.assertions, live.actions].map((c) => c.subscribeChanges(() => {}))
    expect(live.scenes.toArray).toEqual([])
    expect(live.assertions.toArray).toEqual([])
    expect(live.actions.toArray).toEqual([])
    subs.forEach((s) => s.unsubscribe())
  })
})
