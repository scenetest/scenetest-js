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
 * - History + live events both arrive over the SSE stream at `<base>/events`,
 *   which replays the buffered events for the current run on connect and then
 *   streams live ones — all through `subscribe`.
 * - Commands map onto the middleware's existing endpoints:
 *   `run:replay` → POST `<base>/replay` (`{ file?, team? }`),
 *   `run:stop` → POST `<base>/stop`,
 *   `run:pause` → POST `<base>/pause`, `run:resume` → POST `<base>/resume`.
 */
export function createDevTransport(options: DevTransportOptions = {}): Transport {
  const base = (options.base ?? '/__scenetest').replace(/\/+$/, '')

  return {
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
        case 'run:pause':
          await post('/pause')
          return
        case 'run:resume':
          await post('/resume')
          return
      }
    },
  }
}
