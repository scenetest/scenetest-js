// Solid-specific primitives
export { createAssert, __createAssert } from './primitives.js'
export type { RuntimeAssertConfig } from './primitives.js'

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
