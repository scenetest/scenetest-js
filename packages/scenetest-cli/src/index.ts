// Public API for scene specs
export { scene, when } from './scene.js'
export { defineConfig } from './config.js'

// Reactive flow API
export { flow } from './reactive.js'

// Text DSL for declarative scenes
export { runDsl, defineMacro, getMacro, runMacro, clearMacros } from './dsl.js'
export type { DslAction, Macro } from './dsl.js'

// Markdown scene parser
export { parseMarkdownScenes, loadMarkdownScene } from './markdown-scene.js'
export type { MarkdownScene, ActorBlock, SceneAction } from './markdown-scene.js'

// Selector utilities
export { setAliases, getAliases, clearAliases, explainSelector } from './selectors.js'

// Types
export type {
  ScenetestConfig,
  TeamConfig,
  ActorConfig,
  SceneContext,
  SequentialActorHandle,
  ActionChain,
  SceneReport,
  RunReport,
  AssertionResult,
  ScriptWarning,
  Selector,
  ConcurrentActorHandle,
  FlowContext,
  FlowFn,
} from './types.js'
