import type { Collection } from '@tanstack/db'
import type { Transport } from '../types.js'
import { createRunSource } from './source.js'
import { createRunCollection } from './options.js'
import {
  scenesProjection,
  assertionsProjection,
  type SceneRow,
  type AssertionRecord,
} from './projections.js'

/** The collections of a run model, plus the shared source feeding them. */
export interface RunModel {
  /** The one connection all collections ride on. */
  source: ReturnType<typeof createRunSource>
  /** Scene current-state, one row per scene. */
  scenes: Collection<SceneRow, string>
  /** Inline assertion results, one append-only row each. */
  assertions: Collection<AssertionRecord, string>
  /** Tear down the underlying transport subscription. */
  close(): void
}

/**
 * Wire a transport into a ready-to-query read model: one shared source and a
 * collection per table. This is the "subscribe to the stream, attach the
 * tables" entry point — both collections fan out from a single `source`, so
 * there is exactly one SSE/WebSocket connection behind them.
 *
 * @example
 * ```ts
 * const { scenes, assertions, close } = createRunModel(createDevTransport())
 * // …query scenes/assertions with useLiveQuery…
 * // on unmount: close()
 * ```
 */
export function createRunModel(transport: Transport): RunModel {
  const source = createRunSource(transport)
  const scenes = createRunCollection({ source, projection: scenesProjection() })
  const assertions = createRunCollection({ source, projection: assertionsProjection() })
  return {
    source,
    scenes,
    assertions,
    close: () => source.close(),
  }
}
