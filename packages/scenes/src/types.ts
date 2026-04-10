import type { Page, BrowserContext, Browser } from 'playwright'
import type { ScenetestConfig as BaseConfig } from '@scenetest/checks'
import type { DeviceProfile } from './devices.js'

/**
 * Factory function for creating a new browser page + context.
 *
 * Used by `switchDevice()` to tear down the current browser context and
 * create a fresh one.  The factory is created by `TeamSession` and knows
 * how to wire assertion collection, apply device emulation, and track the
 * new context for cleanup.
 *
 * When `device` is non-null, the context uses that device's emulation
 * settings.  When `device` is null, the factory may pick the next device
 * from rotation (if enabled) or create a plain context.
 */
export type PageFactory = (device: DeviceProfile | null) => Promise<{ page: Page; context: BrowserContext }>

/**
 * Selector: space-separated tokens that resolve to DOM elements.
 *
 * Each token matches (in order): aria-label, id, data-testid, data-name, data-key, name
 *
 * Special behavior: after matching a token, if the SAME element has a data-key
 * matching the NEXT token, that token is consumed without descending.
 *
 * A `#N` token (1-based) narrows the current matches to the Nth element.
 * This avoids brittle selectors that hardcode dynamic values like UUIDs.
 *
 * @example
 * 'button'                         // Simple selector
 * 'modal form submit-button'       // Nested: modal > form > submit-button
 * 'playlist-row 12345 like-button' // If playlist-row has data-key="12345", stays on same element
 * 'feed-phrase-link #1'            // Click the first feed-phrase-link
 * 'table-row #2 delete-button'     // Delete button inside the 2nd table-row
 */
export type Selector = string

/**
 * Actor credentials and identity from config
 */
export interface ActorConfig {
  key: string
  username?: string
  email?: string
  password?: string
  /** localStorage entries injected into actor's browser context before each scene */
  localStorage?: Record<string, string>
  /** Warmup: macro name (string) or function. Runs once at test-run start, captures storageState. */
  warmup?: string | ((page: Page, actor: ActorConfig) => Promise<void>)
  [key: string]: unknown
}

/**
 * A team is a complete set of actors with roles as keys.
 * Each team is a self-contained world where all relationships hold.
 */
export type TeamConfig = Record<string, ActorConfig>

/**
 * Team-level metadata — identity and tags.
 *
 * Metadata describes the team for reporting and `[team.field]` interpolation in DSL text.
 *
 * @example
 * ```ts
 * {
 *   name: 'French Content',
 *   tags: { locale: 'fr', region: 'europe' },
 * }
 * ```
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
 * Full team definition — actors plus optional metadata.
 *
 * This is the recommended export format for actor files.
 * Plain `TeamConfig` (Record<string, ActorConfig>) is still supported
 * for backwards compatibility.
 *
 * @example
 * ```ts
 * // scenetest/actors/french.ts
 * import { defineTeam } from '@scenetest/scenes'
 *
 * export default defineTeam({
 *   name: 'French Content',
 *   tags: { locale: 'fr', region: 'europe' },
 *   actors: {
 *     user:  { key: 'fr-user-1', username: 'pierre', email: 'pierre@test.com' },
 *     admin: { key: 'fr-admin-1', username: 'marie', email: 'marie@admin.com' },
 *   },
 * })
 * ```
 */
export interface TeamDef {
  /** Actor credentials by role */
  actors: TeamConfig

  /** Human-readable team name */
  name?: string

  /**
   * Arbitrary key-value tags for filtering and `[team.field]` interpolation.
   */
  tags?: Record<string, string>
}

/**
 * Resolved team — the internal representation after loading.
 *
 * Every team gets a `ResolvedTeam` with actors and metadata split apart,
 * regardless of whether it was defined as a plain `TeamConfig` or a `TeamDef`.
 */
export interface ResolvedTeam {
  /** Actor credentials by role */
  actors: TeamConfig
  /** Team metadata (empty object if not provided) */
  meta: TeamMeta
}

/**
 * Scenetest CLI configuration.
 *
 * Extends the base ScenetestConfig from @scenetest/checks with runner-specific
 * fields (browser, headed, devices, hooks, etc.).
 *
 * Actor teams are not defined here — they are auto-discovered from
 * actor files: `actors.ts` (array of teams) or `actors/*.ts` (one team per file).
 */
export interface ScenetestConfig extends BaseConfig {
  /** Base URL for the application (required for CLI runner) */
  baseUrl: string

  /** Patterns to ignore */
  ignore?: string[]

  /** Browser to use */
  browser?: 'chromium' | 'firefox' | 'webkit'

  /** Show browser window */
  headed?: boolean

  /** Slow down actions by this many ms */
  slowMo?: number

  /** Scene timeout in ms */
  timeout?: number

  /** Individual action timeout in ms */
  actionTimeout?: number

  /** Warn threshold in ms - emit warning if action takes longer than this (default: 500) */
  warnAfter?: number

  /**
   * Selector aliases - map shorthand names to CSS selectors.
   * Use with ~ prefix: user.see('~modal')
   *
   * @example
   * ```ts
   * aliases: {
   *   modal: '[role=dialog]',
   *   'btn-p': 'button[type=submit], button.primary',
   *   nav: '[role=navigation]',
   * }
   * ```
   */
  aliases?: Record<string, string>

  /** Report output directory */
  reportDir?: string

  /** Report format */
  reportFormat?: 'html' | 'json' | 'both'

  /**
   * Device rotation: assign each actor a rotating device profile.
   * When true, uses built-in device pool (mobile, tablet, desktop).
   * When an array of DeviceProfile, uses that as the pool.
   * When false or omitted, all actors get the default Playwright context (no device emulation).
   */
  devices?: boolean | DeviceProfile[]

  /**
   * Disable keyboard-only actor rotation.
   *
   * By default, actors rotate through pointer and keyboard navigation modes.
   * Set to `true` to disable keyboard rotation (all actors use pointer mode).
   *
   * Mirrors the `--no-keyboard-actor` CLI flag.
   */
  noKeyboardActor?: boolean

  /**
   * Enable fuzzy-finger touch behavior.
   *
   * When enabled, pointer-mode actors occasionally (~1 in 5) miss their
   * target, pause 100ms, then click correctly — simulating imprecise
   * human touch input. Tests that touch targets are large enough (WCAG 2.5.8)
   * and spaced far enough apart.
   *
   * Off by default. Mirrors the `--fuzzy-fingers` CLI flag.
   */
  fuzzyFingers?: boolean

  /**
   * Register built-in starter macros (login, logout, refresh-and-retry, etc.).
   *
   * When `true`, all built-in macros are registered before scenes run.
   * When an array of strings, only the named macros are registered.
   * When `false` or omitted, no built-in macros are registered.
   *
   * Built-in macros can be overridden by calling `defineMacro()` with the
   * same name after registration.
   */
  builtinMacros?: boolean | string[]

  /**
   * Swarm mode configuration.
   * When set, enables automatic swarm triggering based on failure thresholds.
   */
  swarm?: SwarmConfig

  /**
   * Suppress the dev panel in the browser.
   * When true, the observer panel is prevented from initializing on pages
   * created by the runner. Assertions still flow to the CLI reporter.
   */
  noPanel?: boolean

  /**
   * Capture browser console errors and surface them in the CLI output.
   *
   * - `true` or `'error'`: capture `console.error` messages only (default: `true`)
   * - `'warn'`: capture both `console.error` and `console.warn` messages
   * - `false`: disable console error detection entirely
   */
  consoleErrors?: boolean | 'error' | 'warn'

  /**
   * Global error selectors — watched across all scenes and actors.
   * When any selector matches a visible element during action execution,
   * a ConsoleError with `source: 'selector'` is recorded alongside
   * console errors and uncaught exceptions.
   *
   * @example
   * ```ts
   * errorSelectors: [
   *   { selector: '[role="alert"]', message: 'Unexpected error toast' },
   *   { selector: '.toast-error',   message: 'Error toast appeared' },
   * ]
   * ```
   */
  errorSelectors?: ErrorSelector[]

  /** Hook: before all scenes run */
  beforeAll?: () => Promise<void>

  /** Hook: after all scenes run */
  afterAll?: () => Promise<void>

  /** Hook: before each scene */
  beforeEach?: (scene: SceneInfo) => Promise<void>

  /** Hook: after each scene */
  afterEach?: (scene: SceneInfo, report: SceneReport) => Promise<void>
}

/**
 * Scene metadata
 */
export interface SceneInfo {
  name: string
  file: string
}

/**
 * Assertion result from app code
 */
export interface AssertionResult {
  type: 'pass' | 'fail'
  description: string
  result: boolean
  timestamp: number
  stack?: string
  context?: Record<string, unknown>
  location?: {
    file: string
    line: number
    column?: number
  }
  /** Which actor's browser triggered this */
  actor?: string
  /** Device the actor was using when this assertion fired */
  device?: string
  /** Navigation mode the actor was using (pointer or keyboard) */
  navigationMode?: string
}

/**
 * Browser console error captured during a scene.
 * These surface uncaught exceptions, failed network requests,
 * and other runtime errors logged by the application under test.
 */
export interface ConsoleError {
  /** The console message text */
  message: string
  /** Which actor's browser produced this error */
  actor: string
  /** When the error was logged */
  timestamp: number
  /** Console message type (error, warning) */
  type: 'error' | 'warning'
  /**
   * Where the error originated:
   * - `'console'` — explicit `console.error()` / `console.warn()` call
   * - `'pageerror'` — uncaught exception or unhandled promise rejection
   * - `'selector'` — a config-level error selector matched a visible element
   */
  source?: 'console' | 'pageerror' | 'selector'
  /** URL of the page when the error occurred */
  url?: string
  /** The CSS selector that matched (only present when source is 'selector') */
  selector?: string
}

/**
 * Script-level warning (not an assertion failure).
 * These indicate unexpected paths in the test script itself,
 * not failures in the application under test.
 */
export interface ScriptWarning {
  /** The selector that triggered this warning */
  selector: string
  /** Human-readable message explaining why this is unexpected */
  message: string
  /** When the warning was triggered */
  timestamp: number
  /** Which actor encountered this */
  actor: string
  /** Action that was executing when the warning triggered */
  duringAction?: string
}

/**
 * Timeline entry for scene actions
 */
export interface TimelineEntry {
  action: string
  target?: string
  actor: string
  timestamp: number
  duration?: number
  error?: string
}

/**
 * Report for a single scene run
 */
export interface SceneReport {
  name: string
  file: string
  status: 'completed' | 'failed' | 'timeout'
  teamIndex: number
  /** Team metadata (name, tags) — empty object when not provided */
  team: TeamMeta
  actors: Record<string, { key: string; username?: string; device?: string; navigationMode?: string }>
  assertions: AssertionResult[]
  warnings: ScriptWarning[]
  consoleErrors: ConsoleError[]
  timeline: TimelineEntry[]
  duration: number
  error?: string
}

/**
 * Full run report
 */
export interface RunReport {
  timestamp: string
  duration: number
  scenes: SceneReport[]
  summary: {
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
  /** Present when this run was triggered by swarm mode */
  swarm?: SwarmReport
}

// ─── Error Selector Types ────────────────────────────────────────────

/**
 * A global error selector watched across all scenes.
 * When the selector matches a visible element during action execution,
 * a ConsoleError with `source: 'selector'` is recorded.
 */
export interface ErrorSelector {
  /** CSS selector, aria-label, or alias (~name) to watch for */
  selector: Selector
  /** Message recorded when the selector matches */
  message: string
}

// ─── Swarm Mode Types ────────────────────────────────────────────────

/**
 * Swarm mode configuration
 */
export interface SwarmConfig {
  /**
   * Number of consecutive failed assertions (across runs) before triggering swarm.
   * Default: 5
   */
  failureThreshold?: number

  /**
   * How many recent runs to consider when evaluating whether failures persist.
   * Default: 3
   */
  windowSize?: number

  /**
   * Maximum concurrent teams during swarm execution.
   * Use to limit database/memory pressure.
   * Default: all teams (no throttle)
   */
  concurrency?: number

  /**
   * Number of times to repeat each scene during swarm mode.
   * More repeats = better signal on flaky vs broken.
   * Default: 3
   */
  repeats?: number

  /**
   * Whether to trigger swarm mode automatically when thresholds are exceeded.
   * When false, swarm is only triggered via CLI flag.
   * Default: true
   */
  auto?: boolean
}

/**
 * Classification of a scene after swarm analysis
 */
export type SwarmClassification =
  /** Always fails across all teams and repeats */
  | 'broken'
  /** Fails intermittently — sometimes passes, sometimes fails */
  | 'flaky'
  /** Fails only with specific team data (seed data edge case) */
  | 'seed-data-edge-case'
  /** Passes consistently — the original failure may have been transient */
  | 'healthy'

/**
 * Swarm result for a single scene
 */
export interface SwarmSceneResult {
  /** Scene name */
  name: string
  /** Scene file */
  file: string
  /** How many times this scene was run */
  runs: number
  /** How many times it passed */
  passed: number
  /** How many times it failed */
  failed: number
  /** Which teams experienced failures (indices) */
  failingTeams: number[]
  /** Which teams passed (indices) */
  passingTeams: number[]
  /** Automatic classification */
  classification: SwarmClassification
  /** Per-run detail */
  details: SwarmRunDetail[]
}

/**
 * Detail for a single swarm run of a scene
 */
export interface SwarmRunDetail {
  teamIndex: number
  repeat: number
  status: 'completed' | 'failed' | 'timeout'
  duration: number
  assertionsFailed: number
  assertionsTotal: number
  error?: string
  actors: Record<string, { device?: string }>
}

/**
 * Full swarm report
 */
export interface SwarmReport {
  /** Why swarm was triggered */
  trigger: 'auto' | 'manual'
  /** Scenes that were swarmed */
  results: SwarmSceneResult[]
  /** Summary counts by classification */
  summary: {
    broken: number
    flaky: number
    seedDataEdgeCase: number
    healthy: number
  }
}

/**
 * Live actor instance during a scene
 */
export interface Actor {
  /** Actor key from config */
  key: string

  /** Role this actor is playing */
  role: string

  /** Actor config (username, email, etc.) */
  config: ActorConfig

  /** Playwright page for this actor */
  page: Page

  /** Playwright browser context for this actor */
  context: BrowserContext

  /** Collected assertions for this actor */
  assertions: AssertionResult[]
}

/**
 * Context passed to scene function
 */
export interface SceneContext {
  /** Get an actor by role from the current team */
  actor: (role: string) => Promise<SequentialActorHandle>

  /** The team index assigned to this scene */
  teamIndex: number

  /** Team metadata (name, tags) */
  team: TeamMeta
}

/**
 * Sequential actor handle with chainable DSL (classic driver model).
 *
 * Each DSL call returns an `ActionChain` — a separate object that queues
 * actions and executes them when awaited.  Scope lives on the chain and
 * resets at each `await` boundary.
 */
export interface SequentialActorHandle extends ActorConfig {
  /** Role this actor is playing */
  role: string

  /** Playwright page */
  page: Page

  /** Open browser to URL (full page load, not SPA routing) */
  openTo(url: string): ActionChain

  /**
   * Reload the current page.
   * Resets scope to page root. Tests that client-side state survives a
   * page reload (e.g. data persisted to localStorage or fetched from server).
   */
  reload(): ActionChain

  /** Navigate back in browser history. Resets scope to page root. */
  goBack(): ActionChain

  /** Navigate forward in browser history. Resets scope to page root. */
  goForward(): ActionChain

  /**
   * Switch to a new device (new browser context).
   *
   * Closes the current browser context — destroying cookies, localStorage,
   * and all client-side state — then creates a fresh context with different
   * device emulation.  Server-side state is unaffected, so this tests
   * whether the app correctly picks up server state on a new device.
   *
   * @param device  Device name from the built-in pool (e.g. `'iPhone 14'`).
   *                When omitted, picks the next device from rotation (or
   *                creates a plain context if rotation is disabled).
   */
  switchDevice(device?: string): ActionChain

  /**
   * Wait for element to be visible and set it as the current scope.
   * Supports nested selectors: 'parent child'
   * Supports tuple selectors: ['playlist-row', '12345'] for name + key
   */
  see(selector: Selector): ActionChain

  /**
   * Wait for element to be visible, in the viewport (no scroll), and set it as scope.
   * Like see() but additionally verifies the element is within the current viewport bounds.
   * Fails if the element exists but requires scrolling to reach.
   */
  seeInView(selector: Selector): ActionChain

  /** Wait for element to NOT be visible (hidden or detached) */
  notSee(selector: Selector): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Wait for element to appear AND disappear (for toasts/notifications) */
  seeToast(selector: Selector): ActionChain

  /**
   * Click element within current scope.
   * If no selector is given, clicks the current scope itself (the element from the last see()).
   * Supports nested selectors: 'parent child'
   * Supports tuple selectors: ['button', '12345'] for name + key
   */
  click(selector?: Selector): ActionChain

  /**
   * Type into input within current scope.
   * Supports nested selectors: 'parent child'
   * Supports tuple selectors: ['input', '12345'] for name + key
   */
  typeInto(selector: Selector, value: string): ActionChain

  /** Check checkbox within current scope */
  check(selector: Selector): ActionChain

  /** Select option in dropdown within current scope */
  select(selector: Selector, value: string): ActionChain

  /** Wait for specified milliseconds */
  wait(ms: number): ActionChain

  /** Emit message to the message bus */
  emit(message: string): ActionChain

  /** Block until message arrives on the message bus */
  waitFor(message: string): ActionChain

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain

  /** Scroll the current scope (or nearest scrollable ancestor) to the bottom */
  scrollToBottom(): ActionChain

  /**
   * Navigate up to an ancestor matching the selector.
   * If no selector is given, resets scope to page root.
   * Use with aliases like ~container to find named containers.
   *
   * @example
   * ```ts
   * user.see('button').up('~container').see('other-element')
   * user.see('deep nested thing').up() // back to page root
   * ```
   */
  up(selector?: Selector): ActionChain

  /**
   * Return to the previously held scope.
   * Useful after navigating with up() or drilling into a child.
   *
   * @example
   * ```ts
   * user.see('parent').see('child').prev().click('sibling')
   * ```
   */
  prev(): ActionChain

  /**
   * Execute a text DSL string.
   * Parses the multiline string into actions and queues them on the chain.
   *
   * @example
   * ```ts
   * await user.dsl(`
   *   openTo /login
   *   see login-form
   *   typeInto email alice@test.com
   *   click submit
   * `)
   * ```
   */
  dsl(text: string): ActionChain

  /** Press a keyboard key (e.g. 'Escape', 'Enter', 'Tab') */
  pressKey(key: string): ActionChain

  /**
   * Point-in-time conditional click.
   * If the element matching the selector is currently visible, click it.
   * If not visible, skip silently and continue.
   */
  ifClick(selector: Selector): ActionChain

  /**
   * Register a conditional watcher. If the selector becomes visible during
   * the next awaited action, the callback will be executed.
   * Watchers are cleared after each await.
   */
  if(selector: Selector, callback: () => Promise<void>): void

  /**
   * Register a script warning. If the selector becomes visible during
   * subsequent actions, a warning is recorded (but test continues).
   * Use for unexpected paths that aren't failures.
   *
   * @example
   * ```ts
   * user.warnIf('welcome-modal', 'should not see welcome - user has dismiss flag')
   * await user.see('dashboard')
   * ```
   */
  warnIf(selector: Selector, message: string): void
}

/**
 * Chainable action builder
 */
export interface ActionChain extends PromiseLike<void> {
  /** Open browser to URL (full page load, not SPA routing) */
  openTo(url: string): ActionChain

  /** Reload the current page. Resets scope to page root. */
  reload(): ActionChain

  /** Navigate back in browser history. Resets scope to page root. */
  goBack(): ActionChain

  /** Navigate forward in browser history. Resets scope to page root. */
  goForward(): ActionChain

  /**
   * Switch to a new device (new browser context).
   * Closes current context (destroys local state), creates fresh context
   * with different device emulation. Server-side state persists.
   *
   * @param device  Device name (e.g. `'iPhone 14'`), or omit for next rotation.
   */
  switchDevice(device?: string): ActionChain

  /**
   * Wait for element to be visible and set it as the current scope.
   * Subsequent actions (click, typeInto, etc.) will look within this scope.
   */
  see(selector: Selector): ActionChain

  /**
   * Wait for element to be visible AND in the viewport (no scroll), and set it as scope.
   * Fails if the element exists but requires scrolling to reach.
   */
  seeInView(selector: Selector): ActionChain

  /** Wait for element to NOT be visible (hidden or detached) */
  notSee(selector: Selector): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Wait for element to appear AND disappear (for toasts/notifications) */
  seeToast(selector: Selector): ActionChain

  /** Click element within current scope, or click current scope if no selector given */
  click(selector?: Selector): ActionChain

  /** Type into input within current scope */
  typeInto(selector: Selector, value: string): ActionChain

  /** Check checkbox within current scope */
  check(selector: Selector): ActionChain

  /** Select option in dropdown within current scope */
  select(selector: Selector, value: string): ActionChain

  /** Wait for specified milliseconds */
  wait(ms: number): ActionChain

  /** Emit message to the message bus */
  emit(message: string): ActionChain

  /** Block until message arrives on the message bus */
  waitFor(message: string): ActionChain

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain

  /** Scroll the current scope (or nearest scrollable ancestor) to the bottom */
  scrollToBottom(): ActionChain

  /** Navigate up to ancestor matching selector, or reset to page root if no selector */
  up(selector?: Selector): ActionChain

  /**
   * Return to the previously held scope.
   * Useful after navigating with up() or drilling into a child.
   *
   * @example
   * ```ts
   * user.see('parent').see('child').prev().click('sibling')
   * ```
   */
  prev(): ActionChain

  /**
   * Execute a text DSL string.
   * Parses the multiline string into actions and queues them on the chain.
   *
   * @example
   * ```ts
   * await user.see('form').dsl(`
   *   typeInto email alice@test.com
   *   typeInto password secret
   *   click submit
   * `)
   * ```
   */
  dsl(text: string): ActionChain

  /** Press a keyboard key (e.g. 'Escape', 'Enter', 'Tab') */
  pressKey(key: string): ActionChain

  /**
   * Point-in-time conditional click.
   * If the element matching the selector is currently visible, click it.
   * If not visible, skip silently and continue.
   */
  ifClick(selector: Selector): ActionChain
}

/**
 * Scene definition function
 */
export type SceneFn = (context: SceneContext) => Promise<void>

/**
 * Options for scene/flow registration.
 */
export interface SceneOptions {
  /** Roles required by this scene. Used for team matching. */
  roles?: string[]
}

/**
 * Registered scene
 */
export interface RegisteredScene {
  name: string
  fn: SceneFn
  file: string
  /**
   * Pre/post-cleanup expressions from `cleanup:` directives in .spec.md files.
   * Each entry is evaluated independently. Multiple `cleanup:` lines are supported.
   */
  cleanup?: string[]
  /**
   * Setup expressions from `setup:` directives in .spec.md files.
   * Run after pre-cleanup but before scene steps. Multiple `setup:` lines supported.
   */
  setup?: string[]
  /** Roles required by this scene — used for team matching */
  roles?: string[]
}

// ---------------------------------------------------------------------------
// DslTarget — shared structural type for text DSL
// ---------------------------------------------------------------------------

/**
 * Minimal interface that both `SequentialActorHandle` and `ConcurrentActorHandle` satisfy.
 *
 * `runMacro()` and the `dsl()` method on actors all operate
 * against this structural type so they work with both execution models.
 *
 * Return types are `unknown` because scene-model methods return `ActionChain`
 * while reactive methods return the actor itself — the text DSL doesn't
 * inspect return values.
 */
export interface DslTarget {
  openTo(url: string): unknown
  reload(): unknown
  goBack(): unknown
  goForward(): unknown
  switchDevice(device?: string): unknown
  see(selector: Selector): unknown
  seeInView(selector: Selector): unknown
  notSee(selector: Selector): unknown
  seeText(text: string): unknown
  seeToast(selector: Selector): unknown
  click(selector?: Selector): unknown
  typeInto(selector: Selector, value: string): unknown
  check(selector: Selector): unknown
  select(selector: Selector, value: string): unknown
  wait(ms: number): unknown
  emit(message: string): unknown
  warnIf(selector: Selector, message: string): void
  up(selector?: Selector): unknown
  prev(): unknown
  scrollToBottom(): unknown
  /** Block until message arrives on the bus */
  waitFor(message: string): unknown
  /** Press a keyboard key (e.g. 'Escape', 'Enter', 'Tab') */
  pressKey(key: string): unknown
  /** Click element if currently visible; skip silently if not */
  ifClick(selector: Selector): unknown
}

// ---------------------------------------------------------------------------
// Reactive flow types
// ---------------------------------------------------------------------------

/**
 * Concurrent actor handle (declarative / flow model).
 *
 * Every DSL method pushes an action onto the actor's persistent queue and
 * returns `this`, so methods are chainable without `await`.
 * Nothing executes until the flow runner calls `drain()`.
 *
 * Scope lives on the actor (not on a throwaway chain) and flows through
 * the queue during sequential drain execution.
 */
export interface ConcurrentActorHandle {
  /** Role this actor is playing */
  readonly role: string

  /** Actor key from config */
  readonly key: string

  /** Actor credentials forwarded from config */
  readonly username?: string
  readonly email?: string
  readonly password?: string
  [key: string]: unknown

  /** Playwright page for low-level access */
  readonly page: Page

  /** Number of queued actions (for testing/inspection) */
  readonly pending: number

  // -- Navigation --
  openTo(url: string): ConcurrentActorHandle
  /** Reload the current page. Resets scope to page root. */
  reload(): ConcurrentActorHandle
  /** Navigate back in browser history. Resets scope to page root. */
  goBack(): ConcurrentActorHandle
  /** Navigate forward in browser history. Resets scope to page root. */
  goForward(): ConcurrentActorHandle
  /**
   * Switch to a new device (new browser context).
   * Closes current context, creates fresh one with different device emulation.
   * @param device  Device name (e.g. `'iPhone 14'`), or omit for next rotation.
   */
  switchDevice(device?: string): ConcurrentActorHandle
  scrollToBottom(): ConcurrentActorHandle

  // -- Observation --
  see(selector: Selector): ConcurrentActorHandle
  seeInView(selector: Selector): ConcurrentActorHandle
  notSee(selector: Selector): ConcurrentActorHandle
  seeText(text: string): ConcurrentActorHandle
  seeToast(selector: Selector): ConcurrentActorHandle

  // -- Interaction --
  click(selector?: Selector): ConcurrentActorHandle
  typeInto(selector: Selector, value: string): ConcurrentActorHandle
  check(selector: Selector): ConcurrentActorHandle
  select(selector: Selector, value: string): ConcurrentActorHandle

  // -- Scope navigation --
  up(selector?: Selector): ConcurrentActorHandle
  prev(): ConcurrentActorHandle

  // -- Timing & coordination --
  wait(ms: number): ConcurrentActorHandle
  emit(message: string): ConcurrentActorHandle
  /** Block this actor's queue until a message arrives on the bus */
  waitFor(message: string): ConcurrentActorHandle

  // -- Escape hatch --
  do(fn: (page: Page) => Promise<void>): ConcurrentActorHandle

  // -- Monitoring --
  warnIf(selector: Selector, message: string): void

  /**
   * Persistent conditional monitor.
   *
   * Polls during every subsequent action.  When `selector` becomes
   * visible, the sub-actions declared inside `callback` execute inline
   * (one-shot).  The callback receives the actor; DSL calls inside it
   * are captured as the monitor's sub-actions.
   */
  if(selector: Selector, callback: (actor: ConcurrentActorHandle) => void): void

  // -- Text DSL --

  /**
   * Queue actions from a text DSL string.
   * Parses the multiline string and pushes each action onto the queue.
   *
   * @example
   * ```ts
   * user.dsl(`
   *   openTo /login
   *   see login-form
   *   typeInto email alice@test.com
   *   click submit
   * `)
   * ```
   */
  dsl(text: string): ConcurrentActorHandle

  /** Press a keyboard key (e.g. 'Escape', 'Enter', 'Tab') */
  pressKey(key: string): ConcurrentActorHandle

  /**
   * Point-in-time conditional click.
   * If the element matching the selector is currently visible, click it.
   * If not visible, skip silently and continue to the next action.
   */
  ifClick(selector: Selector): ConcurrentActorHandle
}

/**
 * Context passed to a flow function.
 *
 * `actor()` is synchronous — it returns a reactive handle immediately.
 * Browser contexts are created in parallel after the declaration phase,
 * before actors begin draining their queues.
 */
export interface FlowContext {
  /** Get or create a concurrent actor by role (synchronous — no await needed) */
  actor: (role: string) => ConcurrentActorHandle
  /** The team index assigned to this flow */
  teamIndex: number
  /** Team metadata (name, tags) */
  team: TeamMeta
}

/**
 * Flow definition function.
 *
 * The function body is the *declaration phase* — actor creation and DSL
 * calls are all synchronous.  After it returns, browsers launch in parallel,
 * then all actors drain their queues concurrently.
 *
 * The function may be async (for backward compatibility or if you need
 * top-level await for non-actor reasons), but it doesn't need to be.
 */
export type FlowFn = (context: FlowContext) => void | Promise<void>

/**
 * CLI options
 */
export interface CLIOptions {
  /** Run in interactive UI mode */
  ui?: boolean

  /** Run with visible browser */
  headed?: boolean

  /** Report output directory */
  report?: string

  /** Report format */
  format?: 'html' | 'json' | 'both'

  /** Config file path */
  config?: string

  /** Enable device rotation */
  devices?: boolean

  /** Disable keyboard-only actor rotation (ON by default) */
  noKeyboardActor?: boolean

  /** Enable fuzzy-finger touch behavior (OFF by default) */
  fuzzyFingers?: boolean

  /** Force swarm mode (run all teams against all scenes) */
  swarm?: boolean

  /** Suppress the dev panel in the browser (useful for CI / headless runs) */
  noPanel?: boolean
}
