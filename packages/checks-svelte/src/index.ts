// Svelte-specific helpers
export { checkEffect } from './helpers.js'

// Re-export everything from core scenecheck for convenience
export { should, failed, assert, match, defineConfig } from '@scenecheck/checks'
export type {
  AssertionResult,
  ScenecheckReporter,
  ScenecheckConfig,
  AssertServerFn,
  AssertDataFn,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from '@scenecheck/checks'
