// Svelte-specific helpers
export { testEffect } from './helpers.js'

// Re-export everything from core scenetest for convenience
export { should, failed, assert, match, defineConfig } from '@scenetest/core'
export type {
  AssertionResult,
  ScenetestReporter,
  ScenetestConfig,
  AssertServerFn,
  AssertDataFn,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from '@scenetest/core'
