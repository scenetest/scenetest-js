// Svelte-specific helpers
export { runAssert, __runAssert, watch } from './helpers.js'
export type { RuntimeAssertConfig, WatchOptions, WatchTracker } from './helpers.js'

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
