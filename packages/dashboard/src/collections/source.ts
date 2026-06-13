import type { RunEvent } from '@scenetest/protocol'
import type { ConnectionStatus, Transport } from '../types.js'
import type { RunSource } from './types.js'

type EventListener = (event: RunEvent) => void
type StatusListener = (status: ConnectionStatus) => void

/**
 * Wrap a {@link Transport} as a shared {@link RunSource}: one
 * `transport.subscribe` fanned out to many collections.
 *
 * Why a layer over the transport at all? Each `createDevTransport()`
 * subscription opens its own `EventSource`; a per-collection subscription
 * would mean N SSE/WebSocket connections for N tables of the same run. The
 * source opens exactly one and multiplexes it, and buffers the current run
 * so a collection created mid-run replays the events it missed — the same
 * catch-up the transports give a fresh connection, but shared.
 *
 * The underlying transport subscription starts lazily on the first
 * `subscribe` and stays open (it does not drop when the last collection
 * detaches, since TanStack DB pauses sync when a collection has no active
 * subscribers, and we want the run to keep accumulating across those gaps).
 * Call {@link RunSource.close} to tear it down for good.
 *
 * History/ordering/de-duplication are the transport's contract — both the
 * dev (SSE) and cloud (WebSocket) adapters replay the run on connect and
 * deliver events in order. The source does not re-derive `seq`; it consumes
 * whatever the subscription delivers.
 */
export function createRunSource(transport: Transport): RunSource {
  const eventListeners = new Set<EventListener>()
  const statusListeners = new Set<StatusListener>()
  // Buffered events for the current run, replayed to late subscribers.
  let buffer: RunEvent[] = []
  let status: ConnectionStatus = 'connecting'
  let unsubscribeTransport: (() => void) | null = null
  let closed = false

  function onTransportEvent(event: RunEvent): void {
    // A new run replaces the buffer so late subscribers don't replay a stale
    // prior run; consumers reset their own state on `run:start` regardless.
    if (event.type === 'run:start') buffer = []
    buffer.push(event)
    for (const listener of [...eventListeners]) listener(event)
  }

  function onTransportStatus(next: ConnectionStatus): void {
    status = next
    for (const listener of [...statusListeners]) listener(next)
  }

  function ensureStarted(): void {
    if (unsubscribeTransport || closed) return
    unsubscribeTransport = transport.subscribe(onTransportEvent, onTransportStatus)
  }

  return {
    get status() {
      return status
    },

    subscribe(onEvent, onStatus) {
      if (closed) return () => {}
      eventListeners.add(onEvent)
      if (onStatus) statusListeners.add(onStatus)

      // Replay the current run so a collection attaching mid-run catches up,
      // then report the current liveness.
      for (const event of buffer) onEvent(event)
      onStatus?.(status)

      ensureStarted()

      return () => {
        eventListeners.delete(onEvent)
        if (onStatus) statusListeners.delete(onStatus)
      }
    },

    close() {
      closed = true
      unsubscribeTransport?.()
      unsubscribeTransport = null
      eventListeners.clear()
      statusListeners.clear()
      buffer = []
    },
  }
}
