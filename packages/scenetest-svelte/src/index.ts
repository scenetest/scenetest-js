// Svelte-specific helpers
export { runAssert, __runAssert } from './helpers.js'
export type { RuntimeAssertConfig } from './helpers.js'

// Re-export everything from core scenetest for convenience
export { pass, fail, assert } from 'scenetest-js'
export type {
  AssertionResult,
  ScenetestReporter,
  AssertionConfig,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from 'scenetest-js'
