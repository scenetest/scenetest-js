// Vue-specific composables
export { useAssert, __useAssert, useWatch } from './composables.js'
export type { RuntimeAssertConfig, UseWatchOptions } from './composables.js'

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
