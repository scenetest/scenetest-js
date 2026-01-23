// Vue-specific composables
export { useAssert, __useAssert } from './composables.js'
export type { RuntimeAssertConfig } from './composables.js'

// Re-export everything from core scenetest for convenience
export { should, failed, assert, match } from '@scenetest/core'
export type {
  AssertionResult,
  ScenetestReporter,
  AssertionConfig,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from '@scenetest/core'
