/**
 * Symphony Visualization
 *
 * A visual representation of assertions flowing through the component tree.
 * Watch events ping around and light up in clusters, scrub through time,
 * and see the symphony of your application's execution.
 */

import type { AssertionResult, AssertionGroup } from '../types.js'
import type {
  SymphonyState,
  EventCluster,
  VisualEvent,
  TreeNode,
} from './types.js'
import { DEFAULT_SETTINGS } from './types.js'
import { buildTree, findNodeForAssertion } from './tree.js'
import { layoutTree, renderCanvas, hitTestNode } from './canvas.js'
import {
  createTimelineState,
  updateTimelineBounds,
  screenToTime,
  renderTimeline,
  getActiveEventsAtTime,
  findClusterAtTime,
} from './timeline.js'
import { assertions, groups } from '../state.js'

// Global symphony state
let state: SymphonyState | null = null
let symphonyWindow: Window | null = null

/**
 * Create the initial symphony state
 */
function createSymphonyState(): SymphonyState {
  return {
    tree: null,
    nodeMap: new Map(),
    clusters: [],
    timeline: createTimelineState(),
    settings: { ...DEFAULT_SETTINGS },
    animationFrame: null,
    lastFrameTime: 0,
  }
}

/**
 * Build event clusters from assertion groups
 */
function buildClusters(
  groupList: AssertionGroup[],
  nodeMap: Map<string, TreeNode>
): EventCluster[] {
  const clusters: EventCluster[] = []

  for (const group of groupList) {
    const events: VisualEvent[] = []
    let passCount = 0
    let failCount = 0
    let minTime = Infinity
    let maxTime = 0

    for (const assertion of group.items) {
      const node = findNodeForAssertion(assertion, nodeMap)
      if (!node) continue

      events.push({
        assertion,
        node,
        group,
        opacity: 1,
        scale: 1,
        glowIntensity: 1,
      })

      minTime = Math.min(minTime, assertion.timestamp)
      maxTime = Math.max(maxTime, assertion.timestamp)

      if (assertion.result) passCount++
      else failCount++
    }

    if (events.length > 0) {
      clusters.push({
        group,
        events,
        startTime: minTime,
        endTime: maxTime,
        activeNodes: new Set(events.map((e) => e.node.id)),
        passCount,
        failCount,
      })
    }
  }

  return clusters
}

/**
 * Update the symphony visualization with new data
 */
function updateSymphony(): void {
  if (!state) return

  // Rebuild tree from all assertions
  const { root, nodeMap } = buildTree(assertions)
  state.tree = root
  state.nodeMap = nodeMap

  // Rebuild clusters
  state.clusters = buildClusters(groups, nodeMap)

  // Update timeline bounds
  state.timeline = updateTimelineBounds(state.timeline, state.clusters)

  // Set current time to the end (most recent)
  state.timeline.currentTime = state.timeline.maxTime
}

/**
 * Main animation loop
 */
function animate(canvas: HTMLCanvasElement, timelineContainer: HTMLElement): void {
  if (!state || !state.tree) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const now = performance.now()
  const _deltaTime = now - state.lastFrameTime
  state.lastFrameTime = now

  // Get active events at current time
  const activeEvents = getActiveEventsAtTime(
    state.timeline.currentTime,
    state.clusters,
    state.settings
  )

  // Render the tree canvas
  renderCanvas(ctx, state.tree, activeEvents, state.settings, state.hoveredNodeId)

  // Render the timeline
  renderTimeline(timelineContainer, state.clusters, state.timeline, state.settings)

  // Continue animation loop
  state.animationFrame = requestAnimationFrame(() => animate(canvas, timelineContainer))
}

// Store hovered node for rendering
declare module './types.js' {
  interface SymphonyState {
    hoveredNodeId?: string | null
  }
}

/**
 * Open the symphony visualization in a new window
 */
export function openSymphony(): void {
  // Close existing window if open
  if (symphonyWindow && !symphonyWindow.closed) {
    symphonyWindow.focus()
    return
  }

  // Initialize state
  state = createSymphonyState()
  updateSymphony()

  // Open new window
  symphonyWindow = window.open('', 'scenetest-symphony', 'width=1200,height=800')
  if (!symphonyWindow) {
    console.error('[scenetest] Failed to open symphony window')
    return
  }

  // Write the HTML structure
  symphonyWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Scenetest Symphony</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            overflow: hidden;
          }
          .symphony-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          .symphony-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: #1e293b;
            border-bottom: 1px solid #334155;
          }
          .symphony-title {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .symphony-title-icon {
            font-size: 20px;
          }
          .symphony-stats {
            display: flex;
            gap: 16px;
            font-size: 13px;
          }
          .symphony-stat {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .symphony-stat.pass { color: #22c55e; }
          .symphony-stat.fail { color: #ef4444; }
          .symphony-canvas-container {
            flex: 1;
            position: relative;
            min-height: 0;
          }
          .symphony-canvas {
            width: 100%;
            height: 100%;
          }
          .symphony-timeline-container {
            height: 80px;
            background: #0f172a;
          }
          .symphony-tooltip {
            position: absolute;
            background: #1e293b;
            border: 1px solid #475569;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            max-width: 300px;
            pointer-events: none;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          }
          .symphony-tooltip-title {
            font-weight: 600;
            margin-bottom: 4px;
          }
          .symphony-tooltip-file {
            color: #94a3b8;
            font-size: 11px;
          }
          .symphony-tooltip-events {
            margin-top: 8px;
            border-top: 1px solid #334155;
            padding-top: 8px;
          }
          .symphony-tooltip-event {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
          }
          .symphony-tooltip-event-icon { font-size: 10px; }
          .symphony-tooltip-event-desc { color: #cbd5e1; }
          .symphony-cluster:hover {
            transform: scale(1.2);
            z-index: 10;
          }
          .symphony-instructions {
            position: absolute;
            bottom: 100px;
            left: 20px;
            font-size: 11px;
            color: #64748b;
            background: rgba(15, 23, 42, 0.9);
            padding: 8px 12px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="symphony-container">
          <div class="symphony-header">
            <div class="symphony-title">
              <span class="symphony-title-icon">&#10024;</span>
              Symphony View
            </div>
            <div class="symphony-stats">
              <span class="symphony-stat pass">
                <span>&#10004;</span>
                <span id="pass-count">0</span>
              </span>
              <span class="symphony-stat fail">
                <span>&#10008;</span>
                <span id="fail-count">0</span>
              </span>
              <span class="symphony-stat">
                <span id="cluster-count">0</span> clusters
              </span>
            </div>
          </div>
          <div class="symphony-canvas-container">
            <canvas class="symphony-canvas" id="symphony-canvas"></canvas>
            <div class="symphony-tooltip" id="symphony-tooltip" style="display: none;"></div>
            <div class="symphony-instructions">
              Hover over nodes to see events. Drag on timeline to scrub through time.
            </div>
          </div>
          <div class="symphony-timeline-container" id="symphony-timeline"></div>
        </div>
      </body>
    </html>
  `)
  symphonyWindow.document.close()

  // Get elements after document is written
  const doc = symphonyWindow.document
  const canvas = doc.getElementById('symphony-canvas') as HTMLCanvasElement
  const timelineContainer = doc.getElementById('symphony-timeline') as HTMLElement
  const tooltip = doc.getElementById('symphony-tooltip') as HTMLElement
  const passCountEl = doc.getElementById('pass-count') as HTMLElement
  const failCountEl = doc.getElementById('fail-count') as HTMLElement
  const clusterCountEl = doc.getElementById('cluster-count') as HTMLElement

  // Resize canvas to fill container
  function resizeCanvas() {
    const container = canvas.parentElement
    if (!container) return

    canvas.width = container.clientWidth
    canvas.height = container.clientHeight

    if (state?.tree) {
      layoutTree(state.tree, canvas.width, canvas.height, state.settings)
    }
  }

  // Initial resize and layout
  resizeCanvas()
  if (state?.tree) {
    layoutTree(state.tree, canvas.width, canvas.height, state.settings)
  }

  symphonyWindow.addEventListener('resize', resizeCanvas)

  // Update stats display
  function updateStats() {
    if (!state) return
    let passCount = 0
    let failCount = 0
    for (const cluster of state.clusters) {
      passCount += cluster.passCount
      failCount += cluster.failCount
    }
    passCountEl.textContent = String(passCount)
    failCountEl.textContent = String(failCount)
    clusterCountEl.textContent = String(state.clusters.length)
  }
  updateStats()

  // Mouse interactions on canvas
  canvas.addEventListener('mousemove', (e) => {
    if (!state?.tree) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const hitNode = hitTestNode(x, y, state.tree, state.settings)
    state.hoveredNodeId = hitNode?.id || null

    if (hitNode) {
      // Find events at this node
      const nodeEvents = state.clusters
        .flatMap((c) => c.events)
        .filter((ev) => ev.node.id === hitNode.id)

      tooltip.innerHTML = `
        <div class="symphony-tooltip-title">${hitNode.name}</div>
        ${hitNode.file ? `<div class="symphony-tooltip-file">${hitNode.file}:${hitNode.line || ''}</div>` : ''}
        ${nodeEvents.length > 0 ? `
          <div class="symphony-tooltip-events">
            ${nodeEvents.slice(0, 5).map((ev) => `
              <div class="symphony-tooltip-event">
                <span class="symphony-tooltip-event-icon" style="color: ${ev.assertion.result ? '#22c55e' : '#ef4444'}">
                  ${ev.assertion.result ? '&#10004;' : '&#10008;'}
                </span>
                <span class="symphony-tooltip-event-desc">${ev.assertion.description}</span>
              </div>
            `).join('')}
            ${nodeEvents.length > 5 ? `<div style="color: #64748b; font-size: 10px;">+${nodeEvents.length - 5} more</div>` : ''}
          </div>
        ` : ''}
      `

      tooltip.style.display = 'block'
      tooltip.style.left = `${e.clientX - rect.left + 15}px`
      tooltip.style.top = `${e.clientY - rect.top + 15}px`
    } else {
      tooltip.style.display = 'none'
    }
  })

  canvas.addEventListener('mouseleave', () => {
    if (state) state.hoveredNodeId = null
    tooltip.style.display = 'none'
  })

  // Timeline interactions
  let isDragging = false

  timelineContainer.addEventListener('mousedown', (e) => {
    isDragging = true
    updateTimeFromMouse(e)
  })

  timelineContainer.addEventListener('mousemove', (e) => {
    if (!state) return

    const rect = timelineContainer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = screenToTime(x, rect.width, state.timeline)

    // Hover detection for clusters
    const hoveredCluster = findClusterAtTime(time, state.clusters, 200)
    state.timeline.hoveredCluster = hoveredCluster

    if (isDragging) {
      updateTimeFromMouse(e)
    }
  })

  function updateTimeFromMouse(e: MouseEvent) {
    if (!state) return
    const rect = timelineContainer.getBoundingClientRect()
    const x = e.clientX - rect.left
    state.timeline.currentTime = screenToTime(x, rect.width, state.timeline)
  }

  doc.addEventListener('mouseup', () => {
    isDragging = false
  })

  // Timeline cluster click
  timelineContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const clusterEl = target.closest('.symphony-cluster') as HTMLElement
    if (clusterEl && state) {
      const clusterId = parseInt(clusterEl.dataset.clusterId || '0', 10)
      const cluster = state.clusters.find((c) => c.group.id === clusterId)
      if (cluster) {
        // Jump to cluster time
        state.timeline.currentTime = cluster.startTime
      }
    }
  })

  // Start animation loop
  state.lastFrameTime = performance.now()
  animate(canvas, timelineContainer)

  // Listen for new assertions from parent window
  const originalReport = window.__scenetest_report
  window.__scenetest_report = function (result: AssertionResult) {
    if (originalReport) originalReport(result)

    // Update symphony with new data
    if (state) {
      updateSymphony()
      updateStats()

      // Auto-scroll timeline to show new events
      if (state.timeline.currentTime < state.timeline.maxTime - 500) {
        state.timeline.currentTime = state.timeline.maxTime
      }
    }
  }

  // Cleanup when window closes
  symphonyWindow.addEventListener('beforeunload', () => {
    if (state?.animationFrame) {
      cancelAnimationFrame(state.animationFrame)
    }
    state = null
    window.__scenetest_report = originalReport || undefined
  })
}

/**
 * Check if symphony window is open
 */
export function isSymphonyOpen(): boolean {
  return symphonyWindow !== null && !symphonyWindow.closed
}

/**
 * Close the symphony window
 */
export function closeSymphony(): void {
  if (symphonyWindow && !symphonyWindow.closed) {
    symphonyWindow.close()
  }
  symphonyWindow = null
}
