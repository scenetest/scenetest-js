// React-specific hooks
export { useAssert, __useAssert, useWatch } from './hooks.js'
export type { RuntimeAssertConfig, UseWatchOptions } from './hooks.js'

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
