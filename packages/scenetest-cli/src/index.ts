// Public API for scene specs
export { scene, when, happens, waitForEvent, getEvents } from './scene.js'
export { defineConfig } from './config.js'

// Types
export type {
  ScenetestConfig,
  CastConfig,
  ActorConfig,
  SceneContext,
  ActorHandle,
  ActionChain,
  SceneReport,
  RunReport,
  AssertionResult,
  SceneEvent,
  EventDescriptor,
} from './types.js'
