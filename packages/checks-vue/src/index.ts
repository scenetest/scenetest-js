// Vue-specific composables
export { watchCheck } from './composables.js'

// Re-export everything from core scenetest for convenience
export { should, failed, serverCheck, match, defineConfig } from '@scenetest/checks'
export type {
  AssertionResult,
  ScenetestReporter,
  ScenetestConfig,
  AssertServerFn,
  AssertDataFn,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from '@scenetest/checks'
