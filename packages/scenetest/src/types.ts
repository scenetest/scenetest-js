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
