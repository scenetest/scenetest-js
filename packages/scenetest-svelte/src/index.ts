// Svelte-specific helpers
export { runAssert, __runAssert, check } from './helpers.js'
export type { RuntimeAssertConfig, CheckOptions, CheckTracker } from './helpers.js'

// Re-export everything from core scenetest for convenience
export { should, failed, assert, match } from 'scenetest'
export type {
  AssertionResult,
  WatchResult,
  ScenetestReporter,
  AssertionConfig,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from 'scenetest'
