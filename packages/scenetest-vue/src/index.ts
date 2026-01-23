// Vue-specific composables
export { useAssert, __useAssert, useCheck } from './composables.js'
export type { RuntimeAssertConfig, UseCheckOptions } from './composables.js'

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
