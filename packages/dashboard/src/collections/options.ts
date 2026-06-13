import type { CollectionConfig } from '@tanstack/db'
import type { RunCollectionOptions } from './types.js'

/**
 * Build TanStack DB collection options that turn the read-only run stream
 * into a reactive table — pass the result to `createCollection`.
 *
 * The projection is the sole writer: a sync transaction is opened per event,
 * the projection's row ops are applied, and the transaction commits. There
 * are no mutation handlers (`onInsert`/`onUpdate`/`onDelete`), so a stray
 * client `.insert()`/`.update()` throws — this is a replica of the run, not
 * a writable store. Validation, if any, is a read-time concern; the sync
 * path lands rows raw, which is exactly right for a server-owned read model.
 *
 * Many collections can share one {@link RunCollectionOptions.source}, each
 * with its own projection, so several tables ride one transport connection.
 *
 * @example
 * ```ts
 * const source = createRunSource(transport)
 * const scenes = createCollection(
 *   runCollectionOptions({ source, projection: scenesProjection() })
 * )
 * const assertions = createCollection(
 *   runCollectionOptions({ source, projection: assertionsProjection() })
 * )
 * ```
 */
export function runCollectionOptions<T extends object, TKey extends string | number>(
  options: RunCollectionOptions<T, TKey>
): CollectionConfig<T, TKey> {
  const { source, projection } = options

  return {
    id: projection.id,
    getKey: projection.getKey,
    startSync: options.startSync ?? true,
    sync: {
      sync: ({ begin, write, commit, truncate, markReady }) => {
        // A shadow map of what this projection has written, so the projection
        // can read prior rows (`get`) without reaching into TanStack DB
        // internals — and so a `reset` clears it in lockstep with `truncate`.
        const rows = new Map<TKey, T>()

        const handle = (event: Parameters<typeof projection.project>[0]) => {
          const ops = projection.project(event, (key) => rows.get(key))
          if (ops.length === 0) return

          begin()
          for (const op of ops) {
            if (op.type === 'reset') {
              rows.clear()
              truncate()
            } else if (op.type === 'delete') {
              rows.delete(op.key)
              write({ type: 'delete', key: op.key })
            } else {
              rows.set(projection.getKey(op.value), op.value)
              write({ type: op.type, value: op.value })
            }
          }
          commit()
        }

        const unsubscribe = source.subscribe(handle)
        // The read model is ready immediately; rows stream in as events arrive
        // (the source replays the current run synchronously on subscribe).
        markReady()
        return unsubscribe
      },
    },
  }
}
