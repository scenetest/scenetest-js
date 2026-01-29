/**
 * Result of an inline assertion, sent to the test runner
 */
export interface AssertionResult {
  type: 'pass' | 'fail'
  description: string
  result: boolean
  timestamp: number
  /** Stack trace to locate where the assertion was called */
  stack?: string
  /** Optional context data for debugging */
  context?: Record<string, unknown>
  /** Parsed source location for click-to-open */
  location?: {
    file: string
    line: number
    column?: number
  }
  /** Source assertion ID for multi-context assertions */
  assertionId?: string
}

/**
 * Server function that runs assertions with access to server context.
 */
export type AssertServerFn<TData = unknown> = (
  server: ServerContext,
  data: TData
) => void | Promise<void>

/**
 * Data provider function that collects data from browser context.
 */
export type AssertDataFn<TData = unknown> = () => TData

/**
 * Server context available in serverFn.
 * Users augment this interface via module declaration in scenecheck.config.ts
 */
export interface ServerContext {
  // Users extend this via module augmentation
}

/**
 * Internal RPC payload sent from browser to server
 */
export interface AssertionRpcPayload {
  /** Unique identifier for this assertion (filename:line:col:key?) */
  id: string
  /** Human-readable title */
  title: string
  /** Optional disambiguation key */
  key?: string
  /** Serialized data from withData() */
  data: unknown
}

/**
 * Internal RPC response from server to browser
 */
export interface AssertionRpcResponse {
  /** Whether the RPC completed successfully */
  success: boolean
  /** Collected assertion results from the serverFn */
  results: AssertionResult[]
  /** Error message if the RPC failed */
  error?: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Scenecheck configuration.
 *
 * This is the base config shape used by scenecheck.config.ts.
 * @scenecheck/scenes extends it with runner-specific fields (browser, headed, etc.)
 * via declaration merging — see `@scenecheck/scenes/types`.
 *
 * The index signature lets CLI-specific fields pass through without error
 * when a user imports defineConfig from core (or a framework binding) but
 * adds fields that only the CLI knows about.
 */
export interface ScenecheckConfig {
  /** Base URL for the application under test */
  baseUrl?: string

  /** Directory or glob for scene specs */
  scenes?: string

  /**
   * Server functions for multi-context assertions.
   * These become the `server` parameter inside assert() serverFn callbacks.
   *
   * @example
   * ```ts
   * serverFunctions: {
   *   getProfile: async (id) => db.query('SELECT * FROM profiles WHERE id = $1', [id]),
   *   validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
   * }
   * ```
   */
  serverFunctions?: Record<string, (...args: any[]) => any>

  /** Allow additional fields from CLI or other extensions */
  [key: string]: unknown
}

/**
 * Type-checked helper for scenecheck.config.ts.
 *
 * Works with the base config shape. If using @scenecheck/scenes runner features,
 * import defineConfig from '@scenecheck/scenes' instead for full type coverage
 * of runner-specific fields (browser, headed, devices, hooks, etc.).
 */
export function defineConfig(config: ScenecheckConfig): ScenecheckConfig {
  return config
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/**
 * The global reporter function exposed by Playwright fixtures
 */
export type ScenecheckReporter = (result: AssertionResult) => void

declare global {
  interface Window {
    __scenecheck_report?: ScenecheckReporter
    __scenecheck_pending?: () => number
  }
}
