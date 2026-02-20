/**
 * Filesystem Viewer — Force-directed graph visualization
 *
 * Renders project files as nodes and import relationships as edges
 * in an interactive Canvas-based force-directed layout, styled with
 * a dark theme and colored node groups.
 */

// ── Types ──────────────────────────────────────────────────────────

interface FsNode {
  id: string
  name: string
  dir: string
  ext: string
  size: number
  group: number
}

interface FsEdge {
  source: string
  target: string
}

interface FsGraphData {
  files: FsNode[]
  edges: FsEdge[]
  groups: string[]
}

interface SimNode extends FsNode {
  x: number
  y: number
  vx: number
  vy: number
  /** Visual radius (based on size + connections) */
  r: number
  /** Whether currently dragged */
  pinned: boolean
}

interface SimEdge {
  source: SimNode
  target: SimNode
}

// ── Color palette ──────────────────────────────────────────────────

const GROUP_COLORS = [
  '#6e8efb', // blue
  '#f97316', // orange
  '#4ade80', // green
  '#f472b6', // pink
  '#a78bfa', // purple
  '#facc15', // yellow
  '#22d3ee', // cyan
  '#f87171', // red
  '#34d399', // emerald
  '#fb923c', // amber
  '#818cf8', // indigo
  '#e879f9', // fuchsia
]

function groupColor(group: number): string {
  return GROUP_COLORS[group % GROUP_COLORS.length]
}

// ── Force simulation ───────────────────────────────────────────────

const REPULSION = 800
const ATTRACTION = 0.005
const EDGE_LENGTH = 120
const CENTER_GRAVITY = 0.01
const DAMPING = 0.92
const MIN_VELOCITY = 0.01
const MAX_VELOCITY = 8

function initSimulation(data: FsGraphData): { nodes: SimNode[]; edges: SimEdge[] } {
  const nodeMap = new Map<string, SimNode>()

  // Count connections per node for sizing
  const connectionCount = new Map<string, number>()
  for (const edge of data.edges) {
    connectionCount.set(edge.source, (connectionCount.get(edge.source) || 0) + 1)
    connectionCount.set(edge.target, (connectionCount.get(edge.target) || 0) + 1)
  }

  // Create simulation nodes with random initial positions
  const cx = 0
  const cy = 0
  const spread = Math.sqrt(data.files.length) * 40

  for (const file of data.files) {
    const connections = connectionCount.get(file.id) || 0
    const r = Math.max(3, Math.min(16, 4 + connections * 1.5))

    nodeMap.set(file.id, {
      ...file,
      x: cx + (Math.random() - 0.5) * spread,
      y: cy + (Math.random() - 0.5) * spread,
      vx: 0,
      vy: 0,
      r,
      pinned: false,
    })
  }

  // Create simulation edges (resolved to node references)
  const edges: SimEdge[] = []
  for (const edge of data.edges) {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (source && target) {
      edges.push({ source, target })
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges }
}

function tickSimulation(nodes: SimNode[], edges: SimEdge[]): boolean {
  let totalKineticEnergy = 0

  // Repulsion: each node pushes away from every other node
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1 }

      const force = REPULSION / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      if (!a.pinned) { a.vx -= fx; a.vy -= fy }
      if (!b.pinned) { b.vx += fx; b.vy += fy }
    }
  }

  // Attraction: edges pull connected nodes together
  for (const edge of edges) {
    const { source, target } = edge
    const dx = target.x - source.x
    const dy = target.y - source.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) continue

    const displacement = dist - EDGE_LENGTH
    const force = displacement * ATTRACTION
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force

    if (!source.pinned) { source.vx += fx; source.vy += fy }
    if (!target.pinned) { target.vx -= fx; target.vy -= fy }
  }

  // Center gravity
  for (const node of nodes) {
    if (node.pinned) continue
    node.vx -= node.x * CENTER_GRAVITY
    node.vy -= node.y * CENTER_GRAVITY
  }

  // Integrate velocity → position
  for (const node of nodes) {
    if (node.pinned) continue

    node.vx *= DAMPING
    node.vy *= DAMPING

    // Clamp velocity
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed > MAX_VELOCITY) {
      node.vx = (node.vx / speed) * MAX_VELOCITY
      node.vy = (node.vy / speed) * MAX_VELOCITY
    }

    node.x += node.vx
    node.y += node.vy

    totalKineticEnergy += node.vx * node.vx + node.vy * node.vy
  }

  // Return true while simulation is still moving
  return totalKineticEnergy > MIN_VELOCITY * nodes.length
}

// ── Renderer ───────────────────────────────────────────────────────

interface ViewTransform {
  offsetX: number
  offsetY: number
  scale: number
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  transform: ViewTransform,
  hoveredNode: SimNode | null,
  width: number,
  height: number,
): void {
  const { offsetX, offsetY, scale } = transform

  ctx.clearRect(0, 0, width, height)

  // Background
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
  ctx.scale(scale, scale)

  // Draw edges
  ctx.lineWidth = 0.5 / scale
  for (const edge of edges) {
    const isHighlighted = hoveredNode &&
      (edge.source === hoveredNode || edge.target === hoveredNode)
    ctx.strokeStyle = isHighlighted
      ? 'rgba(160, 160, 255, 0.6)'
      : 'rgba(100, 100, 140, 0.15)'
    ctx.lineWidth = isHighlighted ? 1.5 / scale : 0.5 / scale
    ctx.beginPath()
    ctx.moveTo(edge.source.x, edge.source.y)
    ctx.lineTo(edge.target.x, edge.target.y)
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes) {
    const isHovered = node === hoveredNode
    const color = groupColor(node.group)

    // Glow for hovered node
    if (isHovered) {
      ctx.shadowColor = color
      ctx.shadowBlur = 15
    }

    ctx.beginPath()
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? color : color + 'cc'
    ctx.fill()

    if (isHovered) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 / scale
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  // Draw labels for hovered node and its neighbors
  if (hoveredNode) {
    const neighbors = new Set<SimNode>()
    for (const edge of edges) {
      if (edge.source === hoveredNode) neighbors.add(edge.target)
      if (edge.target === hoveredNode) neighbors.add(edge.source)
    }

    const labelNodes = [hoveredNode, ...neighbors]
    const fontSize = Math.max(10, 12 / scale)
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'

    for (const node of labelNodes) {
      const isMain = node === hoveredNode
      const label = node.name
      const labelY = node.y - node.r - 6 / scale

      // Background for label
      const metrics = ctx.measureText(label)
      const padding = 4 / scale
      const bgX = node.x - metrics.width / 2 - padding
      const bgY = labelY - fontSize / 2 - padding
      const bgW = metrics.width + padding * 2
      const bgH = fontSize + padding * 2

      ctx.fillStyle = isMain ? 'rgba(13, 17, 23, 0.95)' : 'rgba(13, 17, 23, 0.85)'
      ctx.beginPath()
      roundRect(ctx, bgX, bgY, bgW, bgH, 3 / scale)
      ctx.fill()

      if (isMain) {
        ctx.strokeStyle = groupColor(node.group)
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }

      ctx.fillStyle = isMain ? '#ffffff' : '#a0a0c0'
      ctx.fillText(label, node.x, labelY + fontSize / 3)
    }

    // Draw directory path for hovered node
    const dirLabel = hoveredNode.dir === '.' ? hoveredNode.name : hoveredNode.id
    const dirFontSize = Math.max(9, 10 / scale)
    ctx.font = `${dirFontSize}px ui-monospace, monospace`
    ctx.fillStyle = '#6a6a8a'
    ctx.fillText(dirLabel, hoveredNode.x, hoveredNode.y + hoveredNode.r + 14 / scale + dirFontSize / 3)
  }

  ctx.restore()

  // Draw legend (top-right corner)
  drawLegend(ctx, nodes, width)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  width: number,
): void {
  // Collect unique groups
  const groups = new Map<number, string>()
  for (const node of nodes) {
    if (!groups.has(node.group)) {
      // Use top-level dir as group name
      const topDir = node.id.split('/')[0]
      groups.set(node.group, topDir)
    }
  }

  if (groups.size === 0) return

  const fontSize = 11
  const lineHeight = 18
  const dotR = 5
  const padding = 12
  const margin = 16
  const legendX = width - margin
  const legendY = margin

  ctx.font = `${fontSize}px ui-monospace, monospace`
  ctx.textAlign = 'right'

  let maxWidth = 0
  const entries = Array.from(groups.entries())
  for (const [, name] of entries) {
    const w = ctx.measureText(name).width
    if (w > maxWidth) maxWidth = w
  }

  const boxW = maxWidth + dotR * 2 + padding * 3
  const boxH = entries.length * lineHeight + padding * 2

  // Background
  ctx.fillStyle = 'rgba(13, 17, 23, 0.85)'
  ctx.beginPath()
  roundRect(ctx, legendX - boxW, legendY, boxW, boxH, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(100, 100, 140, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (let i = 0; i < entries.length; i++) {
    const [group, name] = entries[i]
    const y = legendY + padding + i * lineHeight + lineHeight / 2

    // Dot
    ctx.beginPath()
    ctx.arc(legendX - boxW + padding + dotR, y, dotR, 0, Math.PI * 2)
    ctx.fillStyle = groupColor(group)
    ctx.fill()

    // Label
    ctx.fillStyle = '#c0c0d0'
    ctx.textAlign = 'left'
    ctx.fillText(name, legendX - boxW + padding + dotR * 2 + 8, y + fontSize / 3)
  }

  // File count
  ctx.fillStyle = '#6a6a8a'
  ctx.textAlign = 'right'
  ctx.font = `10px ui-monospace, monospace`
  ctx.fillText(`${nodes.length} files`, legendX - padding, legendY + boxH + 14)
}

// ── Interaction ────────────────────────────────────────────────────

function findNodeAt(
  nodes: SimNode[],
  mx: number,
  my: number,
  transform: ViewTransform,
  canvasW: number,
  canvasH: number,
): SimNode | null {
  // Convert screen coords to simulation coords
  const sx = (mx - canvasW / 2 - transform.offsetX) / transform.scale
  const sy = (my - canvasH / 2 - transform.offsetY) / transform.scale

  // Find closest node within hit radius
  let closest: SimNode | null = null
  let closestDist = Infinity

  for (const node of nodes) {
    const dx = node.x - sx
    const dy = node.y - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const hitRadius = Math.max(node.r + 4, 10)

    if (dist < hitRadius && dist < closestDist) {
      closest = node
      closestDist = dist
    }
  }

  return closest
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Mount the filesystem viewer into a container element.
 * Fetches graph data from the dev server and renders an interactive
 * force-directed graph.
 *
 * Returns a cleanup function to stop the animation loop and remove listeners.
 */
export function mountFsViewer(container: HTMLElement): () => void {
  let destroyed = false
  let animationFrame: number | null = null
  let nodes: SimNode[] = []
  let edges: SimEdge[] = []
  let isSimulating = true
  let hoveredNode: SimNode | null = null
  let draggedNode: SimNode | null = null

  const transform: ViewTransform = {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  }

  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.className = 'fs-viewer-canvas'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.cursor = 'grab'

  // Status label
  const statusEl = document.createElement('div')
  statusEl.className = 'fs-viewer-status'
  statusEl.textContent = 'Loading filesystem graph...'

  container.appendChild(canvas)
  container.appendChild(statusEl)

  const ctx = canvas.getContext('2d')!

  function resize(): void {
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    render()
  }

  function render(): void {
    if (destroyed) return
    const rect = container.getBoundingClientRect()
    drawGraph(ctx, nodes, edges, transform, hoveredNode, rect.width, rect.height)
  }

  function simulationLoop(): void {
    if (destroyed) return

    if (isSimulating) {
      const stillMoving = tickSimulation(nodes, edges)
      if (!stillMoving && !draggedNode) {
        isSimulating = false
        statusEl.textContent = `${nodes.length} files, ${edges.length} imports`
      }
    }

    render()
    animationFrame = requestAnimationFrame(simulationLoop)
  }

  // ── Mouse interaction ──

  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartOffX = 0
  let panStartOffY = 0

  function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onMouseDown(e: MouseEvent): void {
    const { x, y } = getCanvasCoords(e)
    const rect = container.getBoundingClientRect()
    const hit = findNodeAt(nodes, x, y, transform, rect.width, rect.height)

    if (hit) {
      draggedNode = hit
      hit.pinned = true
      canvas.style.cursor = 'grabbing'
      isSimulating = true
      e.preventDefault()
    } else {
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      panStartOffX = transform.offsetX
      panStartOffY = transform.offsetY
      canvas.style.cursor = 'grabbing'
    }
  }

  function onMouseMove(e: MouseEvent): void {
    const { x, y } = getCanvasCoords(e)
    const rect = container.getBoundingClientRect()

    if (draggedNode) {
      // Move dragged node in simulation space
      const sx = (x - rect.width / 2 - transform.offsetX) / transform.scale
      const sy = (y - rect.height / 2 - transform.offsetY) / transform.scale
      draggedNode.x = sx
      draggedNode.y = sy
      draggedNode.vx = 0
      draggedNode.vy = 0
      isSimulating = true
      return
    }

    if (isPanning) {
      transform.offsetX = panStartOffX + (e.clientX - panStartX)
      transform.offsetY = panStartOffY + (e.clientY - panStartY)
      return
    }

    // Hover detection
    const hit = findNodeAt(nodes, x, y, transform, rect.width, rect.height)
    if (hit !== hoveredNode) {
      hoveredNode = hit
      canvas.style.cursor = hit ? 'pointer' : 'grab'
    }
  }

  function onMouseUp(): void {
    if (draggedNode) {
      draggedNode.pinned = false
      draggedNode = null
    }
    isPanning = false
    canvas.style.cursor = hoveredNode ? 'pointer' : 'grab'
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08
    const newScale = Math.max(0.1, Math.min(5, transform.scale * zoomFactor))

    // Zoom toward mouse position
    const { x, y } = getCanvasCoords(e)
    const rect = container.getBoundingClientRect()
    const cx = x - rect.width / 2
    const cy = y - rect.height / 2

    const scaleChange = newScale / transform.scale
    transform.offsetX = cx - (cx - transform.offsetX) * scaleChange
    transform.offsetY = cy - (cy - transform.offsetY) * scaleChange
    transform.scale = newScale
  }

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('mouseleave', onMouseUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  // ── Fetch data and start ──

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)

  fetch('/__scenetest/fs')
    .then(r => r.json())
    .then((data: FsGraphData) => {
      if (destroyed) return
      if (data.files.length === 0) {
        statusEl.textContent = 'No source files found.'
        return
      }

      const sim = initSimulation(data)
      nodes = sim.nodes
      edges = sim.edges
      isSimulating = true
      statusEl.textContent = `Laying out ${nodes.length} files...`

      resize()
      simulationLoop()
    })
    .catch(err => {
      if (destroyed) return
      statusEl.textContent = `Error loading filesystem: ${err.message}`
    })

  // Cleanup function
  return () => {
    destroyed = true
    if (animationFrame) cancelAnimationFrame(animationFrame)
    resizeObserver.disconnect()
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('mouseleave', onMouseUp)
    canvas.removeEventListener('wheel', onWheel)
    container.innerHTML = ''
  }
}
