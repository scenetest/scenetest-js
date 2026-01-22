// Vue-specific composables
export { useAssert, __useAssert, useWatch } from './composables.js'
export type { RuntimeAssertConfig, UseWatchOptions } from './composables.js'

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
