/**
 * Canvas Renderer
 *
 * Draws the component tree and animates assertion events
 * flowing through it like light through a neural network.
 */

import type { TreeNode, VisualEvent, SymphonySettings } from './types.js'
import { DEFAULT_SETTINGS } from './types.js'
import { flattenTree } from './tree.js'

/**
 * Layout the tree nodes in a radial or hierarchical arrangement
 */
export function layoutTree(
  root: TreeNode,
  width: number,
  height: number,
  settings: SymphonySettings = DEFAULT_SETTINGS
): void {
  const nodes = flattenTree(root)
  const maxDepth = Math.max(...nodes.map((n) => n.depth))

  // Use a radial layout for a more organic feel
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) / 2 - settings.nodeRadius * 2

  // Count nodes at each depth level
  const nodesByDepth: Map<number, TreeNode[]> = new Map()
  for (const node of nodes) {
    const depthNodes = nodesByDepth.get(node.depth) || []
    depthNodes.push(node)
    nodesByDepth.set(node.depth, depthNodes)
  }

  // Position nodes in concentric circles
  for (const [depth, depthNodes] of nodesByDepth) {
    const radius = maxDepth > 0 ? (depth / maxDepth) * maxRadius : 0
    const angleStep = (2 * Math.PI) / depthNodes.length
    const startAngle = -Math.PI / 2 // Start from top

    depthNodes.forEach((node, index) => {
      if (depth === 0) {
        // Root node at center
        node.x = centerX
        node.y = centerY
      } else {
        const angle = startAngle + index * angleStep
        node.x = centerX + Math.cos(angle) * radius
        node.y = centerY + Math.sin(angle) * radius
      }
      node.width = settings.nodeRadius * 2
      node.height = settings.nodeRadius * 2
    })
  }
}

/**
 * Draw connections between nodes
 */
function drawConnections(
  ctx: CanvasRenderingContext2D,
  root: TreeNode,
  settings: SymphonySettings,
  activeNodes: Set<string>
): void {
  const nodes = flattenTree(root)

  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'

  for (const node of nodes) {
    if (!node.parent || node.x === undefined || node.y === undefined) continue
    if (node.parent.x === undefined || node.parent.y === undefined) continue

    // Check if this connection is active (either node is lit up)
    const isActive = activeNodes.has(node.id) || activeNodes.has(node.parent.id)

    // Draw curved connection
    ctx.beginPath()
    ctx.moveTo(node.parent.x, node.parent.y)

    // Use a quadratic curve for organic feel
    const midX = (node.x + node.parent.x) / 2
    const midY = (node.y + node.parent.y) / 2
    const offset = (node.depth % 2 === 0 ? 1 : -1) * 20

    ctx.quadraticCurveTo(midX + offset, midY + offset, node.x, node.y)

    if (isActive) {
      // Glowing connection
      ctx.strokeStyle = settings.passColor + '88'
      ctx.shadowColor = settings.passColor
      ctx.shadowBlur = 8
    } else {
      ctx.strokeStyle = settings.connectionColor + '44'
      ctx.shadowBlur = 0
    }

    ctx.stroke()
  }

  ctx.shadowBlur = 0
}

/**
 * Draw a single tree node
 */
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: TreeNode,
  settings: SymphonySettings,
  glowIntensity: number = 0,
  glowColor: string | null = null
): void {
  if (node.x === undefined || node.y === undefined) return

  const radius = settings.nodeRadius

  // Outer glow when active
  if (glowIntensity > 0 && glowColor) {
    ctx.beginPath()
    ctx.arc(node.x, node.y, radius * (1 + glowIntensity * 0.5), 0, Math.PI * 2)
    ctx.fillStyle = glowColor + Math.round(glowIntensity * 50).toString(16).padStart(2, '0')
    ctx.shadowColor = glowColor
    ctx.shadowBlur = 15 * glowIntensity
    ctx.fill()
  }

  // Main node circle
  ctx.beginPath()
  ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)

  if (glowIntensity > 0 && glowColor) {
    ctx.fillStyle = glowColor
    ctx.shadowColor = glowColor
    ctx.shadowBlur = 20 * glowIntensity
  } else {
    ctx.fillStyle = settings.nodeColor + '88'
    ctx.shadowBlur = 0
  }

  ctx.fill()

  // Inner highlight
  ctx.beginPath()
  ctx.arc(node.x - radius * 0.2, node.y - radius * 0.2, radius * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fill()

  ctx.shadowBlur = 0
}

/**
 * Draw node label
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  node: TreeNode,
  settings: SymphonySettings,
  isHovered: boolean = false
): void {
  if (node.x === undefined || node.y === undefined) return

  ctx.font = `${isHovered ? '12px' : '10px'} system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = isHovered ? '#fff' : settings.nodeColor + 'cc'

  // Truncate long names
  let name = node.name
  if (name.length > 15) {
    name = name.slice(0, 12) + '...'
  }

  ctx.fillText(name, node.x, node.y + settings.nodeRadius + 4)
}

/**
 * Main render function for the canvas
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  root: TreeNode,
  activeEvents: VisualEvent[],
  settings: SymphonySettings = DEFAULT_SETTINGS,
  hoveredNodeId: string | null = null
): void {
  const { width, height } = ctx.canvas

  // Clear canvas
  ctx.fillStyle = settings.backgroundColor
  ctx.fillRect(0, 0, width, height)

  // Draw subtle grid/stars background
  drawBackground(ctx, width, height, settings)

  // Build set of active nodes and their glow colors/intensities
  const activeNodeMap = new Map<string, { intensity: number; color: string }>()

  for (const event of activeEvents) {
    const nodeId = event.node.id
    const existing = activeNodeMap.get(nodeId)
    const color = event.assertion.result ? settings.passColor : settings.failColor

    if (!existing || event.glowIntensity > existing.intensity) {
      activeNodeMap.set(nodeId, { intensity: event.glowIntensity, color })
    }
  }

  const activeNodes = new Set(activeNodeMap.keys())

  // Draw connections first (behind nodes)
  drawConnections(ctx, root, settings, activeNodes)

  // Draw all nodes
  const nodes = flattenTree(root)
  for (const node of nodes) {
    const activeInfo = activeNodeMap.get(node.id)
    drawNode(
      ctx,
      node,
      settings,
      activeInfo?.intensity || 0,
      activeInfo?.color || null
    )
  }

  // Draw labels (on top)
  for (const node of nodes) {
    drawLabel(ctx, node, settings, node.id === hoveredNodeId)
  }

  // Draw floating event particles
  drawEventParticles(ctx, activeEvents, settings)
}

/**
 * Draw a subtle animated background
 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: SymphonySettings
): void {
  // Subtle radial gradient
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) / 2
  )
  gradient.addColorStop(0, settings.backgroundColor)
  gradient.addColorStop(1, '#000')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Random stars/dots
  ctx.fillStyle = settings.nodeColor + '11'
  const seed = 42
  for (let i = 0; i < 50; i++) {
    const x = (Math.sin(seed + i * 7) * 0.5 + 0.5) * width
    const y = (Math.cos(seed + i * 11) * 0.5 + 0.5) * height
    const r = 1 + (i % 3)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Draw floating particles for active events
 */
function drawEventParticles(
  ctx: CanvasRenderingContext2D,
  activeEvents: VisualEvent[],
  settings: SymphonySettings
): void {
  for (const event of activeEvents) {
    if (!event.node.x || !event.node.y) continue
    if (event.glowIntensity < 0.1) continue

    const color = event.assertion.result ? settings.passColor : settings.failColor

    // Draw expanding ring
    const ringRadius = settings.nodeRadius * (1 + (1 - event.glowIntensity) * 2)
    ctx.beginPath()
    ctx.arc(event.node.x, event.node.y, ringRadius, 0, Math.PI * 2)
    ctx.strokeStyle =
      color + Math.round(event.glowIntensity * 80).toString(16).padStart(2, '0')
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw a small particle floating upward
    const particleOffset = (1 - event.glowIntensity) * 30
    ctx.beginPath()
    ctx.arc(event.node.x, event.node.y - particleOffset, 3, 0, Math.PI * 2)
    ctx.fillStyle =
      color + Math.round(event.glowIntensity * 200).toString(16).padStart(2, '0')
    ctx.fill()
  }
}

/**
 * Hit test to find which node is under the cursor
 */
export function hitTestNode(
  x: number,
  y: number,
  root: TreeNode,
  settings: SymphonySettings = DEFAULT_SETTINGS
): TreeNode | null {
  const nodes = flattenTree(root)
  const hitRadius = settings.nodeRadius * 1.5 // Slightly larger hit area

  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue

    const dx = x - node.x
    const dy = y - node.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= hitRadius) {
      return node
    }
  }

  return null
}
