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
 * Configuration for multi-context assertions.
 * These assertions can compare data from the browser with data from the server.
 */
export interface AssertionConfig<TAppData = unknown> {
  /** Human-readable title for this assertion group */
  title: string
  /** Optional key to disambiguate multiple assertions with the same title */
  key?: string
  /** Function that collects data from the browser context */
  appData: () => TAppData
  /**
   * Function that runs on the server to perform assertions.
   * Has access to server context functions and data collected from the browser.
   */
  assertFn: (server: ServerContext, fromApp: TAppData) => void | Promise<void>
  /** Whether the assertion is enabled (default: true). Set to false to skip. */
  enabled?: boolean
}

/**
 * Server context available in assertFn.
 * Users augment this interface via module declaration in scenetest.config.ts
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
  /** Serialized data from appData() */
  appData: unknown
}

/**
 * Internal RPC response from server to browser
 */
export interface AssertionRpcResponse {
  /** Whether the RPC completed successfully */
  success: boolean
  /** Collected assertion results from the assertFn */
  results: AssertionResult[]
  /** Error message if the RPC failed */
  error?: string
}

/**
 * The global reporter function exposed by Playwright fixtures
 */
export type ScenetestReporter = (result: AssertionResult) => void

declare global {
  interface Window {
    __scenetest_report?: ScenetestReporter
    __scenetest_pending?: () => number
  }
}
