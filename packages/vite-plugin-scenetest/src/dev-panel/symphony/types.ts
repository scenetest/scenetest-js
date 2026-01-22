/**
 * Symphony Visualization Types
 *
 * The symphony view shows assertions flowing through the component tree
 * over time, like watching fireflies light up in a forest.
 */

import type { AssertionResult, AssertionGroup } from '../types.js'

/**
 * A node in the component tree, derived from stack traces
 */
export interface TreeNode {
  id: string
  name: string           // Component or function name
  file?: string          // Source file path
  line?: number          // Line number
  children: TreeNode[]
  parent?: TreeNode
  depth: number

  // Layout computed during rendering
  x?: number
  y?: number
  width?: number
  height?: number
}

/**
 * An assertion event positioned in the visualization
 */
export interface VisualEvent {
  assertion: AssertionResult
  node: TreeNode          // Which tree node this belongs to
  group: AssertionGroup   // The time cluster it belongs to

  // Animation state
  opacity: number
  scale: number
  glowIntensity: number
}

/**
 * A cluster of events that happened together (within 50ms)
 */
export interface EventCluster {
  group: AssertionGroup
  events: VisualEvent[]
  startTime: number
  endTime: number

  // Which tree nodes lit up in this cluster
  activeNodes: Set<string>

  // Stats
  passCount: number
  failCount: number
}

/**
 * Timeline state for scrubbing through time
 */
export interface TimelineState {
  // Time range of all events
  minTime: number
  maxTime: number

  // Current view window
  viewStart: number
  viewEnd: number

  // Playback position (for scrubbing)
  currentTime: number

  // Interaction state
  isPlaying: boolean
  playbackSpeed: number

  // Hover state
  hoveredCluster: EventCluster | null
  hoveredTime: number | null
}

/**
 * The full visualization state
 */
export interface SymphonyState {
  // The component tree
  tree: TreeNode | null
  nodeMap: Map<string, TreeNode>

  // All events organized by cluster
  clusters: EventCluster[]

  // Timeline control
  timeline: TimelineState

  // Visual settings
  settings: SymphonySettings

  // Animation frame tracking
  animationFrame: number | null
  lastFrameTime: number
}

/**
 * Customizable visual settings
 */
export interface SymphonySettings {
  // Colors
  passColor: string
  failColor: string
  nodeColor: string
  connectionColor: string
  backgroundColor: string

  // Animation
  glowDuration: number      // How long a node glows after event
  fadeOutDuration: number   // How long the glow fades
  pulseFrequency: number    // Pulse rate for active nodes

  // Layout
  nodeRadius: number
  nodeSpacing: number
  levelHeight: number

  // Timeline
  timelineHeight: number
  clusterWidth: number
}

/**
 * Parse the call stack to extract component hierarchy
 */
export interface StackFrame {
  functionName: string
  file: string
  line: number
  column?: number
}

/**
 * Default settings for the visualization
 */
export const DEFAULT_SETTINGS: SymphonySettings = {
  // Colors - ethereal, like watching a forest at night
  passColor: '#22c55e',          // Green glow for success
  failColor: '#ef4444',          // Red glow for failure
  nodeColor: '#3b82f6',          // Blue for tree nodes
  connectionColor: '#475569',    // Slate for connections
  backgroundColor: '#0f172a',    // Deep dark blue

  // Animation - smooth and dreamy
  glowDuration: 300,
  fadeOutDuration: 1000,
  pulseFrequency: 2,

  // Layout
  nodeRadius: 8,
  nodeSpacing: 60,
  levelHeight: 80,

  // Timeline
  timelineHeight: 80,
  clusterWidth: 12,
}
