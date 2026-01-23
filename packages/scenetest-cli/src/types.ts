import type { Page, BrowserContext, Browser } from 'playwright'

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
 * A cast is a complete set of actors with roles as keys
 */
export type CastConfig = Record<string, ActorConfig>

/**
 * Scenetest CLI configuration
 */
export interface ScenetestConfig {
  /** Base URL for the application */
  baseUrl: string

  /** Directory or glob for scene specs */
  scenes: string

  /** Patterns to ignore */
  ignore?: string[]

  /** Complete casts - each is an internally-consistent set of actors */
  casts: CastConfig[]

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
  castIndex: number
  actors: Record<string, { id: string; username?: string }>
  assertions: AssertionResult[]
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
  /** Cast an actor from the current cast */
  cast: (role: string) => Promise<ActorHandle>

  /** The cast index assigned to this scene */
  castIndex: number
}

/**
 * Actor handle with chainable DSL
 */
export interface ActorHandle extends ActorConfig {
  /** Role this actor is playing */
  role: string

  /** Playwright page */
  page: Page

  /** Navigate to URL */
  goto(url: string): ActionChain

  /** Wait for element with test ID to be visible */
  seeId(testId: string): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Click element with test ID */
  clickId(testId: string): ActionChain

  /** Type into input with test ID */
  typeInto(testId: string, value: string): ActionChain

  /** Check checkbox with test ID */
  check(testId: string): ActionChain

  /** Select option in dropdown with test ID */
  select(testId: string, value: string): ActionChain

  /** Wait for specified milliseconds */
  wait(ms: number): ActionChain

  /** Emit message to the message bus */
  emit(message: string): ActionChain

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain
}

/**
 * Chainable action builder
 */
export interface ActionChain extends PromiseLike<void> {
  /** Navigate to URL */
  goto(url: string): ActionChain

  /** Wait for element with test ID to be visible */
  seeId(testId: string): ActionChain

  /** Wait for text to be visible */
  seeText(text: string): ActionChain

  /** Click element with test ID */
  clickId(testId: string): ActionChain

  /** Type into input with test ID */
  typeInto(testId: string, value: string): ActionChain

  /** Check checkbox with test ID */
  check(testId: string): ActionChain

  /** Select option in dropdown with test ID */
  select(testId: string, value: string): ActionChain

  /** Wait for specified milliseconds */
  wait(ms: number): ActionChain

  /** Emit message to the message bus */
  emit(message: string): ActionChain

  /** Execute custom action */
  do(fn: (page: Page) => Promise<void>): ActionChain
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
