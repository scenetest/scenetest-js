// Solid-specific primitives
export { createAssert, __createAssert, createCheck } from './primitives.js'
export type { RuntimeAssertConfig, CreateCheckOptions } from './primitives.js'

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
