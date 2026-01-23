// React-specific hooks
export { useAssert, __useAssert } from './hooks.js'
export type { RuntimeAssertConfig } from './hooks.js'

// Re-export everything from core scenetest for convenience
export { pass, fail, assert } from '@mhsnook/scenetest'
export type {
  AssertionResult,
  ScenetestReporter,
  AssertionConfig,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from '@mhsnook/scenetest'
