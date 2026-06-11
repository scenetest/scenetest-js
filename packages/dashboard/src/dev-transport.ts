import { isEventShaped } from '@scenetest/protocol'
import type { Command, RunEvent } from '@scenetest/protocol'
import type { ConnectionStatus, Transport } from './types.js'

export interface DevTransportOptions {
  /**
   * Base path the Vite middleware is mounted at. Defaults to `/__scenetest`.
   * The transport talks to `<base>/events` (SSE) and the command endpoints
   * under `<base>`.
   */
  base?: string
}

/**
 * Transport adapter for dev mode: the Vite middleware, same-origin.
 *
 * - Live events arrive over the SSE stream at `<base>/events`, which also
 *   replays the buffered events for the current run on connect — so history
 *   comes through `subscribe`, and `fetchState` returns empty.
 * - Commands map onto the middleware's existing endpoints:
 *   `run:replay` → POST `<base>/replay` (`{ file?, team? }`),
 *   `run:stop` → POST `<base>/stop`,
 *   `run:pause`/`run:resume` → POST `<base>/pause` (a toggle the server owns).
 */
export function createDevTransport(options: DevTransportOptions = {}): Transport {
  const base = (options.base ?? '/__scenetest').replace(/\/+$/, '')

  return {
    // SSE replays the run buffer on connect, so there is no separate snapshot.
    async fetchState(): Promise<RunEvent[]> {
      return []
    },

    subscribe(onEvent, onStatus): () => void {
      const source = new EventSource(`${base}/events`)
      const status = (s: ConnectionStatus) => onStatus?.(s)
      status('connecting')

      source.onopen = () => status('connected')
      source.onerror = () => status('disconnected')
      source.onmessage = (e: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(e.data)
        } catch {
          return
        }
        // Envelope check only — render event types newer than this widget
        // the producer might send, rather than dropping them.
        if (isEventShaped(parsed)) onEvent(parsed as RunEvent)
      }

      return () => source.close()
    },

    async sendCommand(command: Command): Promise<void> {
      const post = (path: string, body?: unknown) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })

      switch (command.type) {
        case 'run:replay': {
          const body: { file?: string; team?: string } = {}
          if (command.file) body.file = command.file
          if (command.team) body.team = command.team
          await post('/replay', body)
          return
        }
        case 'run:stop':
          await post('/stop')
          return
        // The dev server exposes pause as a single toggle; both map to it.
        case 'run:pause':
        case 'run:resume':
          await post('/pause')
          return
      }
    },
  }
}
