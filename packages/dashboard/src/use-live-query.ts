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
 */
export function useLiveQuery<T>(collection: ObservableRows<T>): T[] {
  const [, setTick] = useState(0)
  useEffect(() => {
    const sub = collection.subscribeChanges(() => setTick((t) => t + 1))
    return () => sub.unsubscribe()
  }, [collection])
  return collection.toArray
}
