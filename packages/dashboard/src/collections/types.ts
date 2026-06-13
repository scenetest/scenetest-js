import type { RunEvent } from '@scenetest/protocol'
import type { ConnectionStatus, Transport } from '../types.js'

/**
 * One row operation a projection emits for a single event. The collection
 * options factory translates these into TanStack DB sync writes:
 *
 * - `insert` / `update` → `write({ type, value })` (key derived via `getKey`)
 * - `delete`            → `write({ type: 'delete', key })`
 * - `reset`            → `truncate()` (drop every row — a new run started)
 *
 * Projections never touch TanStack DB directly; they speak this small,
 * pure vocabulary, which keeps them trivially testable.
 */
export type RowOp<T extends object, TKey extends string | number> =
  | { type: 'insert' | 'update'; value: T }
  | { type: 'delete'; key: TKey }
  | { type: 'reset' }

/**
 * A projection folds the read-only `RunEvent` stream into the rows of one
 * collection — the "sync reducer" the proposal describes. It is the only
 * writer for its table, and it is pure given the event and a reader for the
 * rows it has already produced (`get`), so an `update` can be computed from
 * the prior value.
 *
 * A projection may carry internal counter state (e.g. to mint ids for
 * append-only rows), so create one per collection via a factory rather than
 * sharing a singleton.
 */
export interface RunProjection<T extends object, TKey extends string | number = string> {
  /** Stable identifier, used as the collection's default `id`. */
  readonly id: string
  /** Key extractor for rows of this collection. */
  getKey(row: T): TKey
  /**
   * Fold one event into row operations. `get` reads a row this projection
   * has already emitted (the synced state), so updates merge onto it.
   * Returns an empty array for events this collection does not care about.
   */
  project(event: RunEvent, get: (key: TKey) => T | undefined): Array<RowOp<T, TKey>>
}

/**
 * A shared, read-only handle on a single run's event stream. It wraps one
 * `Transport.subscribe` and fans it out to any number of collections, so
 * several collections can "attach to the same websocket, different table"
 * off one underlying connection.
 *
 * Late subscribers are replayed the current run's buffered events on
 * `subscribe`, so a collection created after the run started still catches
 * up. The buffer resets on `run:start`.
 */
export interface RunSource {
  /**
   * Attach a consumer. `onEvent` is first called synchronously for every
   * buffered event of the current run, then for each live event.
   * `onStatus`, if given, receives connection-liveness changes (and the
   * current status immediately). Returns an unsubscribe function.
   */
  subscribe(
    onEvent: (event: RunEvent) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void
  /** Latest connection liveness reported by the transport. */
  readonly status: ConnectionStatus
  /** Tear down the underlying transport subscription and drop the buffer. */
  close(): void
}

/** Options for {@link runCollectionOptions}. */
export interface RunCollectionOptions<T extends object, TKey extends string | number> {
  /** The shared stream this collection reads from. */
  source: RunSource
  /** The projection that folds events into this collection's rows. */
  projection: RunProjection<T, TKey>
  /**
   * Whether to begin syncing on collection creation rather than on first
   * query. Defaults to `true` so the read model captures the run from the
   * moment it is created, not from the first `useLiveQuery`.
   */
  startSync?: boolean
}

export type { Transport }
