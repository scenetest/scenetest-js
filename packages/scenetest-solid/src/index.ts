// Solid-specific primitives
export { createAssert, __createAssert, createWatch } from './primitives.js'
export type { RuntimeAssertConfig, CreateWatchOptions } from './primitives.js'

// Re-export everything from core scenetest for convenience
export { pass, fail, assert } from 'scenetest'
export type {
  AssertionResult,
  WatchResult,
  ScenetestReporter,
  AssertionConfig,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from 'scenetest'
