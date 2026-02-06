// Public API for scene specs
export { scene } from './scene.js'
export { defineConfig, defineTeam } from './config.js'

// Reactive flow API
export { flow } from './reactive.js'

// Text DSL for declarative scenes
export { defineMacro, getMacro, clearMacros } from './dsl.js'
export type { DslAction, Macro } from './dsl.js'

// Markdown scene parser
export { parseMarkdownScenes, loadMarkdownScene } from './markdown-scene.js'
export type { MarkdownScene, ActorBlock, SceneAction } from './markdown-scene.js'

// Selector utilities
export { setAliases, getAliases, clearAliases, explainSelector } from './selectors.js'

// Device rotation
export { DeviceRotation, builtinDevices } from './devices.js'
export type { DeviceProfile } from './devices.js'

// Swarm mode
export { SwarmTrigger } from './swarm.js'

// Types
export type {
  ScenetestConfig,
  TeamConfig,
  TeamDef,
  TeamMeta,
  ResolvedTeam,
  ActorConfig,
  SceneOptions,
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
  SwarmConfig,
  SwarmReport,
  SwarmSceneResult,
  SwarmRunDetail,
  SwarmClassification,
} from './types.js'
