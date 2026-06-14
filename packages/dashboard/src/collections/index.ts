/**
 * A read-only TanStack DB read model over the run event stream.
 *
 * `createRunSource(transport)` wraps the widget's existing transport (SSE in
 * dev, WebSocket in cloud) as a shared, fan-out stream; `runCollectionOptions`
 * turns a projection of that stream into a `CollectionConfig` you pass to your
 * own `createCollection` (so the collection is built by the same `@tanstack/db`
 * your `useLiveQuery` uses). Several collections share one source — one
 * connection, many tables — and each is a server-owned replica with no client
 * writes.
 *
 * This is the *read* half of the pipeline (a client of the broadcast layer),
 * distinct from `@scenetest/receiver`, which is the *ingest* half.
 */
export { createRunSource } from './source.js'
export { runCollectionOptions } from './options.js'
export {
  scenesProjection,
  assertionsProjection,
  runsProjection,
  attributeToScene,
  type SceneRow,
  type AssertionRecord,
  type RunRow,
} from './projections.js'
export type {
  RowOp,
  RunProjection,
  RunSource,
  RunCollectionOptions,
} from './types.js'
