import type { Command, RunEvent, TeamMeta } from '@scenetest/protocol'

/**
 * Liveness of the transport's event subscription, surfaced in the header's
 * connection indicator. Transports report this through `subscribe`'s second
 * argument; transports that can't tell may stay `'connected'`.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * The injection point where dev and cloud differ. The widget calls the
 * adapter to fetch a state snapshot and subscribe to live events, and pushes
 * user actions back as protocol commands. The adapter speaks to whatever
 * backend is present — the Vite middleware (fetch + SSE) in dev, the worker
 * API (fetch + WebSocket) in cloud — so the dashboard behaves the same in
 * both by construction.
 */
export interface Transport {
  /**
   * A snapshot of the run so far, as an ordered list of protocol events the
   * widget folds into its initial state. Transports that deliver history
   * through the initial `subscribe` burst instead (e.g. SSE replay) may
   * return an empty array — the store folds both the same way.
   */
  fetchState(): Promise<RunEvent[]>

  /**
   * Subscribe to live events. `onEvent` receives every event after the
   * snapshot; `onStatus`, if given, receives connection-liveness changes.
   * Returns an unsubscribe function that tears down the underlying stream.
   */
  subscribe(onEvent: (event: RunEvent) => void, onStatus?: (status: ConnectionStatus) => void): () => void

  /** Send a command toward the runner (replay, stop, pause, resume). */
  sendCommand(command: Command): Promise<void>
}

/** A single DSL action on one actor's lane. */
export interface ActionItem {
  action: string
  target?: string
  startTime: number
  endTime: number | null
  duration: number | null
  error: string | null
  status: 'running' | 'success' | 'slow' | 'error'
}

/** One actor's ordered actions within a scene. */
export interface Lane {
  actor: string
  items: ActionItem[]
}

/** An inline assertion result observed during a scene. */
export interface AssertionRow {
  actor?: string
  description: string
  result: boolean
  timestamp: number
}

/** A scene folded from its lifecycle events. */
export interface Scene {
  name: string
  file: string
  actors: string[]
  lanes: Lane[]
  assertions: AssertionRow[]
  startTime: number
  endTime: number | null
  status: 'running' | 'completed' | 'failed' | 'timeout' | string
  duration?: number
  error?: string
  team: TeamMeta
  teamIndex: number
}

/** Everything the widget renders, folded from the protocol event stream. */
export interface DashboardState {
  scenes: Scene[]
  currentSceneIndex: number | null
  runStartTime: number | null
  passCount: number
  failCount: number
  sceneCount: number
  /** Distinct team names seen in `scene:start`, for the replay filter. */
  teams: string[]
  running: boolean
  /** Final run duration once `run:end` arrives, else null. */
  endDurationMs: number | null
  /** Latest `run:progress` rollup, when the producer emits one. */
  progress?: { pct: number; failing: number; flaky: number }
  connection: ConnectionStatus
}

/** Theming surface — the only knobs a host may set. Versioned with the widget. */
export interface DashboardTheme {
  /** Background of the terminal pane. */
  bg?: string
  /** Accent / primary action color. */
  accent?: string
  /** Font family for the pane. */
  font?: string
  /** Base font size (e.g. `'13px'`). */
  fontSize?: string
}

export interface MountOptions {
  transport: Transport
  /** Optional theme overrides applied as `--st-*` custom properties. */
  theme?: DashboardTheme
}

/** Handle returned by `mountDashboard`. */
export interface DashboardHandle {
  /** Tear down the widget, its subscription, and its shadow root contents. */
  unmount(): void
}
