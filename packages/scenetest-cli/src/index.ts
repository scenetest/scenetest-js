// Public API for scene specs
export { scene, when } from './scene.js'
export { defineConfig } from './config.js'

// Reactive flow API
export { flow } from './reactive.js'

// Text DSL for declarative scenes
export { runDsl, defineMacro, getMacro, runMacro, clearMacros } from './dsl.js'
export type { DslAction, Macro } from './dsl.js'

// Selector utilities
export { setAliases, getAliases, clearAliases, explainSelector } from './selectors.js'

// Types
export type {
  ScenetestConfig,
  TeamConfig,
  ActorConfig,
  SceneContext,
  ActorHandle,
  ActionChain,
  SceneReport,
  RunReport,
  AssertionResult,
  ScriptWarning,
  Selector,
  ReactiveActor,
  FlowContext,
  FlowFn,
} from './types.js'
