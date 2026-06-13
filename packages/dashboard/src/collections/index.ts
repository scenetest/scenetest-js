/**
 * A read-only TanStack DB read model over the run event stream.
 *
 * `createRunSource(transport)` wraps the widget's existing transport (SSE in
 * dev, WebSocket in cloud) as a shared, fan-out stream; `runCollectionOptions`
 * turns a projection of that stream into a reactive collection. Several
 * collections share one source — one connection, many tables — and each is a
 * server-owned replica with no client writes. Drive live queries off them
 * with `useLiveQuery` from `@tanstack/react-db` (or your framework binding).
 *
 * This is the *read* half of the pipeline (a client of the broadcast layer),
 * distinct from `@scenetest/receiver`, which is the *ingest* half.
 */
export { createRunSource } from './source.js'
export { runCollectionOptions, createRunCollection } from './options.js'
export { createRunModel, type RunModel } from './model.js'
export {
  scenesProjection,
  assertionsProjection,
  type SceneRow,
  type AssertionRecord,
} from './projections.js'
export type {
  RowOp,
  RunProjection,
  RunSource,
  RunCollectionOptions,
} from './types.js'
