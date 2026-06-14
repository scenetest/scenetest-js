import { useEffect, useState } from 'preact/hooks'

/**
 * The minimal shape this hook needs from a TanStack DB collection: read its
 * rows and subscribe to changes. Both base collections (`createCollection`) and
 * derived ones (`createLiveQueryCollection`) satisfy it, so a view can read a
 * raw table or a `.where(...).orderBy(...)` query through the same hook.
 */
export interface ObservableRows<T> {
  readonly toArray: T[]
  subscribeChanges(callback: (changes: unknown) => void): { unsubscribe: () => void }
}

/**
 * Read a TanStack DB collection reactively: subscribe to its changes, re-render
 * on each, and return the current rows. This is the Preact analogue of
 * `@tanstack/react-db`'s `useLiveQuery` — the pattern to reach for, rather than
 * a hand-rolled `subscribeChanges` + force-update in every component. Pass a
 * stable collection (created once, e.g. via `useMemo` or at the app root); a
 * fresh collection each render would resubscribe every time.
 *
 * The returned array keeps a **stable identity between changes** (`collection.toArray`
 * builds a fresh array on every access, so we snapshot it only when a change
 * actually fires). That's what lets downstream `useMemo`s over these rows
 * (`selectSnapshot`, the Runner's filter/group memos) hit instead of recomputing
 * every render.
 */
export function useLiveQuery<T>(collection: ObservableRows<T>): T[] {
  const [rows, setRows] = useState<T[]>(() => collection.toArray)
  useEffect(() => {
    setRows(collection.toArray) // resync in case it changed before we subscribed
    const sub = collection.subscribeChanges(() => setRows(collection.toArray))
    return () => sub.unsubscribe()
  }, [collection])
  return rows
}
