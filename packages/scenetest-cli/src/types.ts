import type { Page, BrowserContext, Browser } from 'playwright'

/**
 * Selector: space-separated tokens that resolve to DOM elements.
 *
 * Each token matches (in order): aria-label, id, data-testid, data-name, data-key, name
 *
 * Special behavior: after matching a token, if the SAME element has a data-key
 * matching the NEXT token, that token is consumed without descending.
 *
 * @example
 * 'button'                        // Simple selector
 * 'modal form submit-button'      // Nested: modal > form > submit-button
 * 'playlist-row 12345 like-button' // If playlist-row has data-key="12345", stays on same element
 */
export type Selector = string

/**
 * Actor credentials and identity from config
 */
export interface ActorConfig {
  id: string
  username?: string
  email?: string
  password?: string
  [key: string]: unknown
}

/**
 * A team is a complete set of actors with roles as keys.
 * Each team is a self-contained world where all relationships hold.
 */
export type TeamConfig = Record<string, ActorConfig>

/**
 * Scenetest CLI configuration.
 *
 * Actor teams are not defined here — they are auto-discovered from
 * actor files: `actors.ts` (array of teams) or `actors/*.ts` (one team per file).
 */
export interface ScenetestConfig {
  /** Base URL for the application */
  baseUrl: string

  /** Directory or glob for scene specs */
  scenes?: string

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
  actors: Record<string, { id: string; username?: string }>
  assertions: AssertionResult[]
  warnings: ScriptWarning[]
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
  }
}

/**
 * Live actor instance during a scene
 */
export interface Actor {
  /** Actor ID from config */
  id: string

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
  actor: (role: string) => Promise<ActorHandle>

  /** The team index assigned to this scene */
  teamIndex: number
}

/**
 * Actor handle with chainable DSL
 */
export interface ActorHandle extends ActorConfig {
  /** Role this actor is playing */
  role: string

  /** Playwright page */
  page: Page

  /** Open browser to URL (full page load, not SPA routing) */
  openTo(url: string): ActionChain

  /**
   * Wait for element to be visible and set it as the current scope.
   * Supports nested selectors: 'parent child'
   * Supports tuple selectors: ['playlist-row', '12345'] for name + key
   */
  see(selector: Selector): ActionChain

  /** Wait for element to NOT be visible (hidden or detached) */
  notSee(selector: Selector): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Wait for element to appear AND disappear (for toasts/notifications) */
  seeToast(selector: Selector): ActionChain

  /**
   * Click element within current scope.
   * Supports nested selectors: 'parent child'
   * Supports tuple selectors: ['button', '12345'] for name + key
   */
  click(selector: Selector): ActionChain

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

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain

  /** Scroll the current scope (or nearest scrollable ancestor) to the bottom */
  scrollToBottom(): ActionChain

  /**
   * Navigate up to an ancestor matching the selector.
   * Use with aliases like ~container to find named containers.
   *
   * @example
   * ```ts
   * user.see('button').up('~container').see('other-element')
   * ```
   */
  up(selector: Selector): ActionChain

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

  /**
   * Wait for element to be visible and set it as the current scope.
   * Subsequent actions (click, typeInto, etc.) will look within this scope.
   */
  see(selector: Selector): ActionChain

  /** Wait for element to NOT be visible (hidden or detached) */
  notSee(selector: Selector): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Wait for element to appear AND disappear (for toasts/notifications) */
  seeToast(selector: Selector): ActionChain

  /** Click element within current scope */
  click(selector: Selector): ActionChain

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

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain

  /** Scroll the current scope (or nearest scrollable ancestor) to the bottom */
  scrollToBottom(): ActionChain

  /**
   * Navigate up to an ancestor matching the selector.
   * Use with aliases like ~container to find named containers.
   *
   * @example
   * ```ts
   * user.see('button').up('~container').see('other-element')
   * ```
   */
  up(selector: Selector): ActionChain

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
}

/**
 * Scene definition function
 */
export type SceneFn = (context: SceneContext) => Promise<void>

/**
 * Registered scene
 */
export interface RegisteredScene {
  name: string
  fn: SceneFn
  file: string
}

// ---------------------------------------------------------------------------
// DslTarget — shared structural type for text DSL
// ---------------------------------------------------------------------------

/**
 * Minimal interface that both `ActorHandle` and `ReactiveActor` satisfy.
 *
 * `runDsl()`, `runMacro()`, and the `dsl()` method on actors all operate
 * against this structural type so they work with both execution models.
 *
 * Return types are `unknown` because scene-model methods return `ActionChain`
 * while reactive methods return the actor itself — the text DSL doesn't
 * inspect return values.
 */
export interface DslTarget {
  openTo(url: string): unknown
  see(selector: Selector): unknown
  notSee(selector: Selector): unknown
  seeText(text: string): unknown
  seeToast(selector: Selector): unknown
  click(selector: Selector): unknown
  typeInto(selector: Selector, value: string): unknown
  check(selector: Selector): unknown
  select(selector: Selector, value: string): unknown
  wait(ms: number): unknown
  emit(message: string): unknown
  warnIf(selector: Selector, message: string): void
  up(selector: Selector): unknown
  prev(): unknown
  scrollToBottom(): unknown
}

// ---------------------------------------------------------------------------
// Reactive flow types
// ---------------------------------------------------------------------------

/**
 * A reactive actor handle.
 *
 * Every DSL method pushes an action onto the actor's persistent queue and
 * returns `this`, so methods are chainable without `await`.
 * Nothing executes until the flow runner calls `drain()`.
 *
 * Scope lives on the actor (not on a throwaway chain) and flows through
 * the queue during sequential drain execution.
 */
export interface ReactiveActor {
  /** Role this actor is playing */
  readonly role: string

  /** Actor ID from config */
  readonly id: string

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
  openTo(url: string): ReactiveActor
  scrollToBottom(): ReactiveActor

  // -- Observation --
  see(selector: Selector): ReactiveActor
  notSee(selector: Selector): ReactiveActor
  seeText(text: string): ReactiveActor
  seeToast(selector: Selector): ReactiveActor

  // -- Interaction --
  click(selector: Selector): ReactiveActor
  typeInto(selector: Selector, value: string): ReactiveActor
  check(selector: Selector): ReactiveActor
  select(selector: Selector, value: string): ReactiveActor

  // -- Scope navigation --
  up(selector: Selector): ReactiveActor
  prev(): ReactiveActor

  // -- Timing & coordination --
  wait(ms: number): ReactiveActor
  emit(message: string): ReactiveActor
  /** Block this actor's queue until a message arrives on the bus */
  waitFor(message: string): ReactiveActor

  // -- Escape hatch --
  do(fn: (page: Page) => Promise<void>): ReactiveActor

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
  if(selector: Selector, callback: (actor: ReactiveActor) => void): void

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
  dsl(text: string): ReactiveActor
}

/**
 * Context passed to a flow function.
 *
 * `actor()` is synchronous — it returns a reactive handle immediately.
 * Browser contexts are created in parallel after the declaration phase,
 * before actors begin draining their queues.
 */
export interface FlowContext {
  /** Get or create a reactive actor by role (synchronous — no await needed) */
  actor: (role: string) => ReactiveActor
  /** The team index assigned to this flow */
  teamIndex: number
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
}
