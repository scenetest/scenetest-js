// Public API for scene specs
//
// Two authoring entry points:
//   - `scene()` — reactive queue-building (scenetest's unique approach)
//   - `test()`  — await-driven sequential orchestration (Playwright-style)
export { test } from './scene.js'
export { scene } from './reactive.js'
export { defineConfig, defineTeam } from './config.js'

// Text DSL for declarative scenes
export { defineMacro, getMacro, clearMacros } from './dsl.js'
export type { DslAction, Macro } from './dsl.js'

// Markdown scene parser
export { parseMarkdownScenes, loadMarkdownScene } from './markdown-scene.js'
export type { MarkdownScene, ActorBlock, SceneAction } from './markdown-scene.js'

// Selector utilities
export { setAliases, getAliases, clearAliases, explainSelector } from './selectors.js'

// Device rotation
export { DeviceRotation, builtinDevices, findDevice } from './devices.js'
export type { DeviceProfile } from './devices.js'

// Keyboard navigation mode
export { NavigationModeRotation, FuzzyFingerError } from './keyboard.js'
export type { NavigationMode } from './keyboard.js'

// Built-in macros
export { registerBuiltinMacros, registerSelectedMacros, builtinMacroDefinitions } from './builtin-macros.js'

// Swarm mode
export { SwarmTrigger } from './swarm.js'

// Warmup
export type { StorageState } from './warmup.js'

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
  SceneFn,
  TestContext,
  TestFn,
  SequentialActorHandle,
  ActionChain,
  SceneReport,
  RunReport,
  AssertionResult,
  ScriptWarning,
  ConsoleError,
  Selector,
  ConcurrentActorHandle,
  SwarmConfig,
  SwarmReport,
  SwarmSceneResult,
  SwarmRunDetail,
  SwarmClassification,
  ErrorSelector,
  PageFactory,
} from './types.js'
