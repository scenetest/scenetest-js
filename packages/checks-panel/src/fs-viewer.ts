/**
 * Filesystem Viewer — Force-directed graph visualization
 *
 * Renders assertion locations as a force-directed graph where:
 * - Each file with assertions becomes a node
 * - Files in the same directory are connected by edges
 * - Node size reflects assertion count
 * - Node color reflects pass/fail status
 * - Hover shows file details and assertion list
 */

import type { LocationGroup } from './types.js'

// ── Types ──────────────────────────────────────────────────────────

interface FileNode {
  id: string        // relative file path
  name: string      // file name
  dir: string       // directory path
  passCount: number
  failCount: number
  totalCount: number
  assertions: { description: string; result: boolean }[]
}

interface SimNode extends FileNode {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pinned: boolean
}

interface SimEdge {
  source: SimNode
  target: SimNode
}

// ── Color palette ──────────────────────────────────────────────────

const DIR_COLORS = [
  '#6e8efb', // blue
  '#f97316', // orange
  '#4ade80', // green
  '#f472b6', // pink
  '#a78bfa', // purple
  '#facc15', // yellow
  '#22d3ee', // cyan
  '#34d399', // emerald
  '#fb923c', // amber
  '#818cf8', // indigo
  '#e879f9', // fuchsia
  '#f87171', // red
]

function dirColor(dirIndex: number): string {
  return DIR_COLORS[dirIndex % DIR_COLORS.length]
}

// ── Build graph from LocationGroups ────────────────────────────────

function buildGraphFromLocations(locations: LocationGroup[]): { files: FileNode[]; dirMap: Map<string, number> } {
  const fileMap = new Map<string, FileNode>()
  const dirMap = new Map<string, number>()

  for (const loc of locations) {
    const file = loc.location?.file
    if (!file) continue

    const parts = file.split('/')
    const name = parts[parts.length - 1]
    const dir = parts.slice(0, -1).join('/') || '.'

    if (!dirMap.has(dir)) {
      dirMap.set(dir, dirMap.size)
    }

    let node = fileMap.get(file)
    if (!node) {
      node = { id: file, name, dir, passCount: 0, failCount: 0, totalCount: 0, assertions: [] }
      fileMap.set(file, node)
    }

    node.totalCount += loc.entries.length
    for (const entry of loc.entries) {
      if (entry.result) node.passCount++
      else node.failCount++
    }
    node.assertions.push({
      description: loc.description,
      result: loc.lastResult,
    })
  }

  return { files: Array.from(fileMap.values()), dirMap }
}

// ── Force simulation ───────────────────────────────────────────────

const REPULSION = 600
const ATTRACTION = 0.008
const EDGE_LENGTH = 100
const CENTER_GRAVITY = 0.012
const DAMPING = 0.9
const MIN_VELOCITY = 0.01
const MAX_VELOCITY = 8

function initSimulation(files: FileNode[]): { nodes: SimNode[]; edges: SimEdge[] } {
  const spread = Math.max(200, Math.sqrt(files.length) * 60)

  const nodes: SimNode[] = files.map(f => ({
    ...f,
    x: (Math.random() - 0.5) * spread,
    y: (Math.random() - 0.5) * spread,
    vx: 0,
    vy: 0,
    r: Math.max(5, Math.min(20, 5 + Math.sqrt(f.totalCount) * 3)),
    pinned: false,
  }))

  // Build edges: connect files in the same directory
  const edges: SimEdge[] = []
  const byDir = new Map<string, SimNode[]>()
  for (const node of nodes) {
    let group = byDir.get(node.dir)
    if (!group) {
      group = []
      byDir.set(node.dir, group)
    }
    group.push(node)
  }

  for (const [, group] of byDir) {
    // Connect files in same directory in a chain (not full mesh, to avoid clutter)
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({ source: group[i], target: group[i + 1] })
    }
  }

  return { nodes, edges }
}

function tickSimulation(nodes: SimNode[], edges: SimEdge[]): boolean {
  let totalKineticEnergy = 0

  // Repulsion between all nodes
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

  // Attraction along edges
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

  // Integrate
  for (const node of nodes) {
    if (node.pinned) continue
    node.vx *= DAMPING
    node.vy *= DAMPING
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed > MAX_VELOCITY) {
      node.vx = (node.vx / speed) * MAX_VELOCITY
      node.vy = (node.vy / speed) * MAX_VELOCITY
    }
    node.x += node.vx
    node.y += node.vy
    totalKineticEnergy += node.vx * node.vx + node.vy * node.vy
  }

  return totalKineticEnergy > MIN_VELOCITY * nodes.length
}

// ── Renderer ───────────────────────────────────────────────────────

interface ViewTransform {
  offsetX: number
  offsetY: number
  scale: number
}

function nodeColor(node: SimNode, dirMap: Map<string, number>): string {
  if (node.failCount > 0) return '#f87171'
  return dirColor(dirMap.get(node.dir) ?? 0)
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  transform: ViewTransform,
  hoveredNode: SimNode | null,
  width: number,
  height: number,
  dirMap: Map<string, number>,
): void {
  const { offsetX, offsetY, scale } = transform

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
  ctx.scale(scale, scale)

  // Draw edges
  for (const edge of edges) {
    const isHighlighted = hoveredNode &&
      (edge.source === hoveredNode || edge.target === hoveredNode)
    ctx.strokeStyle = isHighlighted
      ? 'rgba(160, 160, 255, 0.5)'
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
    const color = nodeColor(node, dirMap)

    if (isHovered) {
      ctx.shadowColor = color
      ctx.shadowBlur = 15
    }

    ctx.beginPath()
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? color : color + 'cc'
    ctx.fill()

    // Pass/fail ring: outer ring shows failure ratio
    if (node.failCount > 0 && node.totalCount > 1) {
      const failAngle = (node.failCount / node.totalCount) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r + 2 / scale, -Math.PI / 2, -Math.PI / 2 + failAngle)
      ctx.strokeStyle = '#f87171'
      ctx.lineWidth = 2 / scale
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r + 2 / scale, -Math.PI / 2 + failAngle, -Math.PI / 2 + Math.PI * 2)
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2 / scale
      ctx.stroke()
    }

    if (isHovered) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 / scale
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  // Labels for hovered node and neighbors
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
        ctx.strokeStyle = nodeColor(node, dirMap)
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }

      ctx.fillStyle = isMain ? '#ffffff' : '#a0a0c0'
      ctx.fillText(label, node.x, labelY + fontSize / 3)
    }

    // Detail label below hovered node: file path + assertion counts
    const detailFontSize = Math.max(9, 10 / scale)
    ctx.font = `${detailFontSize}px ui-monospace, monospace`
    ctx.fillStyle = '#6a6a8a'
    const detail = `${hoveredNode.id}  (${hoveredNode.passCount}\u2713 ${hoveredNode.failCount}\u2717)`
    ctx.fillText(detail, hoveredNode.x, hoveredNode.y + hoveredNode.r + 14 / scale + detailFontSize / 3)
  }

  ctx.restore()

  // Legend
  drawLegend(ctx, nodes, width, dirMap)
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
  dirMap: Map<string, number>,
): void {
  const dirs = new Map<string, number>()
  for (const node of nodes) {
    dirs.set(node.dir, (dirs.get(node.dir) || 0) + 1)
  }
  if (dirs.size === 0) return

  const fontSize = 11
  const lineHeight = 18
  const dotR = 5
  const padding = 12
  const margin = 16
  const legendX = width - margin

  ctx.font = `${fontSize}px ui-monospace, monospace`
  ctx.textAlign = 'right'

  let maxWidth = 0
  const entries = Array.from(dirs.entries())
  for (const [dir] of entries) {
    const w = ctx.measureText(`${dir}/`).width
    if (w > maxWidth) maxWidth = w
  }

  const boxW = maxWidth + dotR * 2 + padding * 3
  const boxH = entries.length * lineHeight + padding * 2

  ctx.fillStyle = 'rgba(13, 17, 23, 0.85)'
  ctx.beginPath()
  roundRect(ctx, legendX - boxW, margin, boxW, boxH, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(100, 100, 140, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (let i = 0; i < entries.length; i++) {
    const [dir] = entries[i]
    const y = margin + padding + i * lineHeight + lineHeight / 2

    ctx.beginPath()
    ctx.arc(legendX - boxW + padding + dotR, y, dotR, 0, Math.PI * 2)
    ctx.fillStyle = dirColor(dirMap.get(dir) ?? 0)
    ctx.fill()

    ctx.fillStyle = '#c0c0d0'
    ctx.textAlign = 'left'
    ctx.fillText(`${dir}/`, legendX - boxW + padding + dotR * 2 + 8, y + fontSize / 3)
  }

  const totalAssertions = nodes.reduce((sum, n) => sum + n.totalCount, 0)
  ctx.fillStyle = '#6a6a8a'
  ctx.textAlign = 'right'
  ctx.font = `10px ui-monospace, monospace`
  ctx.fillText(`${nodes.length} files, ${totalAssertions} assertions`, legendX - padding, margin + boxH + 14)
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
  const sx = (mx - canvasW / 2 - transform.offsetX) / transform.scale
  const sy = (my - canvasH / 2 - transform.offsetY) / transform.scale

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
 * Takes location groups from panel state and renders an interactive
 * force-directed graph of files containing assertions.
 *
 * Returns a cleanup function to stop the animation loop and remove listeners.
 */
export function mountFsViewer(container: HTMLElement, locations: LocationGroup[]): () => void {
  let destroyed = false
  let animationFrame: number | null = null
  let nodes: SimNode[] = []
  let edges: SimEdge[] = []
  let isSimulating = true
  let hoveredNode: SimNode | null = null
  let draggedNode: SimNode | null = null
  let dirMap = new Map<string, number>()

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

  container.appendChild(canvas)
  container.appendChild(statusEl)

  const ctx = canvas.getContext('2d')!

  function resize(): void {
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render()
  }

  function render(): void {
    if (destroyed) return
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    drawGraph(ctx, nodes, edges, transform, hoveredNode, rect.width, rect.height, dirMap)
  }

  function simulationLoop(): void {
    if (destroyed) return

    if (isSimulating) {
      const stillMoving = tickSimulation(nodes, edges)
      if (!stillMoving && !draggedNode) {
        isSimulating = false
        const totalAssertions = nodes.reduce((sum, n) => sum + n.totalCount, 0)
        statusEl.textContent = `${nodes.length} files, ${totalAssertions} assertions`
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

  // ── Init from data ──

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)

  const { files, dirMap: dm } = buildGraphFromLocations(locations)
  dirMap = dm

  if (files.length === 0) {
    statusEl.textContent = 'No assertion locations found. Interact with your app to populate the graph.'
    // Still start the loop so new data can be shown if we're re-mounted
  } else {
    const sim = initSimulation(files)
    nodes = sim.nodes
    edges = sim.edges
    isSimulating = true
    statusEl.textContent = `Laying out ${nodes.length} files...`
  }

  resize()
  simulationLoop()

  // Cleanup
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
