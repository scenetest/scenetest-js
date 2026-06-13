import type { DashboardEvent, DashboardEventInput } from './types.js'
import { reportUrlSend } from './report-url-reporter.js'

/**
 * Streams dashboard events to the Vite dev server for the live timeline.
 *
 * All sends are fire-and-forget — if the Vite server isn't running or
 * doesn't have the scenetest plugin, events silently drop.
 * Zero impact on test execution.
 */
export class DashboardReporter {
  private endpoint: string
  private connected: boolean | null = null // null = unknown

  constructor(baseUrl: string) {
    // Strip trailing slash, append event endpoint
    this.endpoint = baseUrl.replace(/\/+$/, '') + '/__scenetest/events'
  }

  /** Post an event to the Vite dev server. Non-blocking, never throws. */
  send(event: DashboardEvent): void {
    // Skip if we already know the server isn't listening
    if (this.connected === false) return

    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(2000),
    })
      .then((res) => {
        this.connected = res.ok
      })
      .catch(() => {
        // First failure — mark as disconnected so we stop trying
        this.connected = false
      })
  }

  /** Dashboard URL for the user to open in a browser. */
  get dashboardUrl(): string {
    return this.endpoint.replace('/events', '')
  }
}

// ─── Module-level singleton ─────────────────────────────────────────
// Set by the runner before execution; read by actor.ts and team-manager.ts
// without needing to thread through every constructor.

let _reporter: DashboardReporter | null = null

export function setDashboardReporter(reporter: DashboardReporter | null): void {
  _reporter = reporter
}

// The id of the run currently being emitted. Set when `run:start` passes
// through, then stamped onto every event of that run, so callers don't have
// to thread it through. Within a single producer process events are emitted
// in order (run:start first), so this is reliable here — unlike a consumer,
// which can attach mid-stream and must read `runId` off the event.
let _currentRunId = ''

export function dashboardSend(event: DashboardEventInput): void {
  if (event.type === 'run:start') _currentRunId = String(event.timestamp)
  const stamped = { ...event, runId: _currentRunId } as DashboardEvent

  // Fan out to every configured sink: the dev-server dashboard (SSE/jsonl) and
  // the optional caller-supplied --report-url endpoint. Both are fire-and-forget.
  _reporter?.send(stamped)
  reportUrlSend(stamped)
}
