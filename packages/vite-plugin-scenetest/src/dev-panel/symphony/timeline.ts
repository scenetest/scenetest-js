/**
 * Timeline Controller
 *
 * Manages the horizontal timeline that shows event clusters over time.
 * Supports scrubbing, zooming, and playback.
 */

import type { AssertionGroup } from '../types.js'
import type {
  EventCluster,
  TimelineState,
  SymphonySettings,
  VisualEvent,
} from './types.js'
import { DEFAULT_SETTINGS } from './types.js'

/**
 * Create the initial timeline state
 */
export function createTimelineState(): TimelineState {
  return {
    minTime: 0,
    maxTime: 0,
    viewStart: 0,
    viewEnd: 0,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1,
    hoveredCluster: null,
    hoveredTime: null,
  }
}

/**
 * Update timeline bounds based on clusters
 */
export function updateTimelineBounds(
  state: TimelineState,
  clusters: EventCluster[]
): TimelineState {
  if (clusters.length === 0) {
    return { ...state, minTime: 0, maxTime: 0, viewStart: 0, viewEnd: 0 }
  }

  const minTime = Math.min(...clusters.map((c) => c.startTime))
  const maxTime = Math.max(...clusters.map((c) => c.endTime))

  // Add some padding
  const padding = (maxTime - minTime) * 0.05 || 1000

  return {
    ...state,
    minTime: minTime - padding,
    maxTime: maxTime + padding,
    viewStart: minTime - padding,
    viewEnd: maxTime + padding,
  }
}

/**
 * Convert screen X position to time
 */
export function screenToTime(
  x: number,
  containerWidth: number,
  state: TimelineState
): number {
  const ratio = x / containerWidth
  return state.viewStart + ratio * (state.viewEnd - state.viewStart)
}

/**
 * Convert time to screen X position
 */
export function timeToScreen(
  time: number,
  containerWidth: number,
  state: TimelineState
): number {
  if (state.viewEnd === state.viewStart) return 0
  const ratio = (time - state.viewStart) / (state.viewEnd - state.viewStart)
  return ratio * containerWidth
}

/**
 * Find the cluster at a given time
 */
export function findClusterAtTime(
  time: number,
  clusters: EventCluster[],
  threshold: number = 100
): EventCluster | null {
  // Find the closest cluster within threshold
  let closest: EventCluster | null = null
  let closestDist = Infinity

  for (const cluster of clusters) {
    const center = (cluster.startTime + cluster.endTime) / 2
    const dist = Math.abs(time - center)

    if (dist < closestDist && dist < threshold) {
      closest = cluster
      closestDist = dist
    }
  }

  return closest
}

/**
 * Zoom the timeline around a point
 */
export function zoomTimeline(
  state: TimelineState,
  centerTime: number,
  zoomFactor: number
): TimelineState {
  const currentRange = state.viewEnd - state.viewStart
  const newRange = currentRange / zoomFactor

  // Keep the center point at the same position
  const centerRatio = (centerTime - state.viewStart) / currentRange
  const newStart = centerTime - centerRatio * newRange
  const newEnd = centerTime + (1 - centerRatio) * newRange

  // Clamp to bounds
  return {
    ...state,
    viewStart: Math.max(state.minTime, newStart),
    viewEnd: Math.min(state.maxTime, newEnd),
  }
}

/**
 * Pan the timeline by a delta
 */
export function panTimeline(state: TimelineState, deltaTime: number): TimelineState {
  const range = state.viewEnd - state.viewStart
  let newStart = state.viewStart + deltaTime
  let newEnd = state.viewEnd + deltaTime

  // Clamp to bounds
  if (newStart < state.minTime) {
    newStart = state.minTime
    newEnd = newStart + range
  }
  if (newEnd > state.maxTime) {
    newEnd = state.maxTime
    newStart = newEnd - range
  }

  return {
    ...state,
    viewStart: newStart,
    viewEnd: newEnd,
  }
}

/**
 * Render the timeline HTML
 */
export function renderTimeline(
  container: HTMLElement,
  clusters: EventCluster[],
  state: TimelineState,
  settings: SymphonySettings = DEFAULT_SETTINGS
): void {
  const width = container.clientWidth
  const height = settings.timelineHeight

  // Build the timeline HTML
  let html = `
    <div class="symphony-timeline" style="
      width: 100%;
      height: ${height}px;
      background: linear-gradient(180deg, ${settings.backgroundColor}00 0%, ${settings.backgroundColor} 100%);
      position: relative;
      overflow: hidden;
      border-top: 1px solid ${settings.connectionColor}44;
    ">
      <div class="symphony-timeline-track" style="
        position: absolute;
        bottom: 20px;
        left: 0;
        right: 0;
        height: 4px;
        background: ${settings.connectionColor}44;
        border-radius: 2px;
      "></div>
  `

  // Render each cluster as a glowing pip
  for (const cluster of clusters) {
    const x = timeToScreen(cluster.startTime, width, state)
    const clusterWidth = Math.max(
      settings.clusterWidth,
      timeToScreen(cluster.endTime, width, state) - x
    )

    // Determine color based on pass/fail ratio
    const total = cluster.passCount + cluster.failCount
    const failRatio = total > 0 ? cluster.failCount / total : 0
    const color = failRatio > 0 ? settings.failColor : settings.passColor
    const intensity = Math.min(1, total / 10) // More events = brighter

    html += `
      <div class="symphony-cluster"
        data-cluster-id="${cluster.group.id}"
        style="
          position: absolute;
          bottom: 16px;
          left: ${x}px;
          width: ${clusterWidth}px;
          height: 12px;
          background: ${color};
          border-radius: 6px;
          opacity: ${0.4 + intensity * 0.6};
          box-shadow: 0 0 ${8 + intensity * 12}px ${color}88;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        "
        title="${total} events at ${formatTime(cluster.startTime)}"
      >
        <div class="symphony-cluster-count" style="
          position: absolute;
          top: -18px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          color: ${settings.nodeColor};
          font-weight: 500;
          white-space: nowrap;
        ">${total}</div>
      </div>
    `
  }

  // Scrubber handle
  const scrubberX = timeToScreen(state.currentTime, width, state)
  html += `
    <div class="symphony-scrubber" style="
      position: absolute;
      bottom: 0;
      left: ${scrubberX}px;
      width: 2px;
      height: 100%;
      background: white;
      pointer-events: none;
      opacity: 0.8;
      box-shadow: 0 0 8px white;
    "></div>
  `

  html += `</div>`
  container.innerHTML = html
}

/**
 * Format a timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
}

/**
 * Get events that are active at a given time
 */
export function getActiveEventsAtTime(
  time: number,
  clusters: EventCluster[],
  settings: SymphonySettings = DEFAULT_SETTINGS
): VisualEvent[] {
  const activeEvents: VisualEvent[] = []
  const window = settings.glowDuration + settings.fadeOutDuration

  for (const cluster of clusters) {
    for (const event of cluster.events) {
      const eventTime = event.assertion.timestamp
      const age = time - eventTime

      // Event is active if it happened within our glow window
      if (age >= 0 && age <= window) {
        // Calculate glow intensity based on age
        let intensity: number
        if (age <= settings.glowDuration) {
          // Full glow during initial period
          intensity = 1
        } else {
          // Fade out
          const fadeProgress = (age - settings.glowDuration) / settings.fadeOutDuration
          intensity = 1 - fadeProgress
        }

        activeEvents.push({
          ...event,
          glowIntensity: intensity,
          opacity: 0.3 + intensity * 0.7,
          scale: 1 + intensity * 0.3,
        })
      }
    }
  }

  return activeEvents
}
