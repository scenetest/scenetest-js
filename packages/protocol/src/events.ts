/**
 * The event vocabulary of the scenetest protocol.
 *
 * Producers: the CLI runner (Playwright actions, scene lifecycle), the
 * injected client listener (assertion results). Consumers: the dashboard
 * (live view), the recorder (`.jsonl` in dev, R2/D1 in cloud), and the
 * run rollups that feed the home view.
 *
 * The shapes here are the wire format. Field changes are breaking changes
 * and must bump {@link PROTOCOL_VERSION} — users run last month's CLI
 * against today's cloud worker, so version skew between producer and
 * consumer is normal, not exceptional. Additive optional fields and new
 * event types are non-breaking; consumers must ignore unknown fields and
 * may pass through unknown event types (see `isEventShaped` in codec.ts).
 */

/**
 * Wire protocol version. Bump only for incompatible changes to existing
 * event or command shapes — never for additive ones.
 */
export const PROTOCOL_VERSION = 1

/**
 * Team metadata attached to scene lifecycle events.
 */
export interface TeamMeta {
  /** Human-readable team name (used in reports and CLI output) */
  name?: string

  /**
   * Arbitrary key-value tags for filtering and `[team.field]` interpolation.
   *
   * @example
   * ```ts
   * tags: { locale: 'fr', region: 'europe', tier: 'premium' }
   * // In DSL: openTo /categories/[team.locale]
   * ```
   */
  tags?: Record<string, string>
}

/**
 * Aggregate counts for a finished run. Carried on `run:end` and persisted
 * in run reports.
 */
export interface RunSummary {
  scenes: number
  completed: number
  failed: number
  assertions: {
    total: number
    passed: number
    failed: number
  }
  warnings: number
  consoleErrors: number
}

// ─── Event types ─────────────────────────────────────────────────────

/** A run began. Consumers typically reset live state on this event. */
export interface RunStartEvent {
  type: 'run:start'
  timestamp: number
  /**
   * The run this event belongs to. Producers stamp every event of a run with
   * the same id (the `run:start` timestamp), so consumers can partition a
   * whole PR's history by run and resume/attach mid-stream without inferring
   * the run from event order.
   */
  runId: string
  sceneCount: number
}

/** A scene began executing. */
export interface SceneStartEvent {
  type: 'scene:start'
  timestamp: number
  runId: string
  name: string
  file: string
  actors: string[]
  teamIndex: number
  team: TeamMeta
}

/** An actor started a DSL action (click, fill, openTo, …). */
export interface ActionStartEvent {
  type: 'action:start'
  timestamp: number
  runId: string
  actor: string
  action: string
  target?: string
  /**
   * The scene this event belongs to, when the producer knows it. Additive
   * (optional) so older CLIs still validate; consumers attribute by these
   * when present and fall back to actor+time-window otherwise. `scene` is the
   * scene name; with `teamIndex` and `runId` it reconstructs the scene's id.
   */
  scene?: string
  teamIndex?: number
}

/** An actor finished a DSL action. `error` is set when the action failed. */
export interface ActionEndEvent {
  type: 'action:end'
  timestamp: number
  runId: string
  actor: string
  action: string
  target?: string
  duration: number
  error?: string
  /** Owning scene, when known. See {@link ActionStartEvent.scene}. */
  scene?: string
  teamIndex?: number
}

/** An inline assertion (`should()` / `failed()`) resolved in the app under test. */
export interface AssertionEvent {
  type: 'assertion'
  timestamp: number
  runId: string
  actor?: string
  description: string
  result: boolean
  /** Owning scene, when known. See {@link ActionStartEvent.scene}. */
  scene?: string
  teamIndex?: number
}

/** A script-level warning — an unexpected path in the test script itself. */
export interface WarningEvent {
  type: 'warning'
  timestamp: number
  runId: string
  actor: string
  selector: string
  message: string
  /** Owning scene, when known. See {@link ActionStartEvent.scene}. */
  scene?: string
  teamIndex?: number
}

/** A scene finished. */
export interface SceneEndEvent {
  type: 'scene:end'
  timestamp: number
  runId: string
  name: string
  status: string
  duration: number
  error?: string
  teamIndex: number
  team: TeamMeta
}

/**
 * Coarse run-status rollup, throttled (on change, at most every ~2s).
 * Computed by whoever owns the live run state — the run's Durable Object
 * in cloud — from the fine-grained events above, and fanned out to
 * home-view consumers so raw assertion events never leave the run's own
 * viewers.
 */
export interface RunProgressEvent {
  type: 'run:progress'
  timestamp: number
  runId: string
  /** Completion estimate, 0–100. */
  pct: number
  /** Scenes currently failing. */
  failing: number
  /** Scenes flagged flaky so far. */
  flaky: number
}

/** The run finished. */
export interface RunEndEvent {
  type: 'run:end'
  timestamp: number
  runId: string
  duration: number
  summary: RunSummary
}

/**
 * Every event that can cross the wire, from any producer.
 *
 * (Known to the dev tool as `DashboardEvent` — `@scenetest/scenes`
 * re-exports this union under that name for backwards compatibility.)
 */
export type RunEvent =
  | RunStartEvent
  | SceneStartEvent
  | ActionStartEvent
  | ActionEndEvent
  | AssertionEvent
  | WarningEvent
  | SceneEndEvent
  | RunProgressEvent
  | RunEndEvent

/** All known event type tags. */
export const EVENT_TYPES = [
  'run:start',
  'scene:start',
  'action:start',
  'action:end',
  'assertion',
  'warning',
  'scene:end',
  'run:progress',
  'run:end',
] as const satisfies readonly RunEvent['type'][]
