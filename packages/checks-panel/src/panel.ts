/**
 * Main panel UI management
 */

import type { FilterMode, CornerPosition } from './types.js'
import {
  groups,
  passCount,
  failCount,
  panel,
  listEl,
  filter,
  setPanel,
  setListEl,
  setFilter,
  clearAll,
  toggleGroupCollapsed,
  panelCorner,
  setPanelCorner,
} from './state.js'
import { filterItems } from './utils.js'
import { renderPanelGroup, attachEventListeners } from './render.js'
import { openInEditor } from './utils.js'
import { panelStyles } from './styles.js'
import { openFullscreen, updateFullscreenWindow } from './fullscreen.js'
import {
  clearSymphony,
  playSymphony,
  stopSymphony,
  toggleMute,
  isPlaying,
  getSymphonyInfo,
  initAudio,
} from './audio.js'

/**
 * Get the HTML template for the panel
 */
function getPanelHTML(): string {
  return `
    <style>${panelStyles}</style>
    <div id="scenetest-header">
      <span id="scenetest-title"><span class="scenetest-icon"><span>\uD83C\uDFAC</span></span>scenetest</span>
      <span id="scenetest-counts">
        <span class="scenetest-count pass" id="scenetest-pass" title="Click to filter passes">\u2713 0</span>
        <span class="scenetest-count fail" id="scenetest-fail" title="Click to filter failures">\u2717 0</span>
      </span>
    </div>
    <div id="scenetest-actions">
      <div class="scenetest-btn-group">
        <button class="scenetest-btn active" id="scenetest-filter-all">all</button>
        <button class="scenetest-btn" id="scenetest-filter-fails">errors</button>
      </div>
      <span class="scenetest-separator"></span>
      <div class="scenetest-btn-group scenetest-audio-controls">
        <button class="scenetest-btn scenetest-audio-btn" id="scenetest-mute" title="Toggle sound">\uD83D\uDD0A</button>
        <button class="scenetest-btn scenetest-audio-btn" id="scenetest-play" title="Play symphony">\u25B6</button>
      </div>
      <span class="scenetest-separator"></span>
      <a class="scenetest-btn" id="scenetest-dashboard" href="/__scenetest/dashboard" target="_blank" title="Live dashboard">dashboard</a>
      <button class="scenetest-btn" id="scenetest-fullscreen">fullscreen</button>
      <button class="scenetest-btn" id="scenetest-clear">clear</button>
    </div>
    <div id="scenetest-list">
      <div id="scenetest-empty">Click around to see inline assertions...</div>
    </div>
  `
}

/**
 * Handle filter change
 */
function handleSetFilter(newFilter: FilterMode): void {
  setFilter(newFilter)
  // Update button states
  panel?.querySelector('#scenetest-filter-all')?.classList.toggle('active', filter === 'all')
  panel?.querySelector('#scenetest-filter-fails')?.classList.toggle('active', filter === 'fails')
  panel?.querySelector('#scenetest-pass')?.classList.toggle('active', filter === 'passes')
  panel?.querySelector('#scenetest-fail')?.classList.toggle('active', filter === 'fails')
  updatePanel()
  updateFullscreenWindow()
}

/**
 * Apply the correct corner CSS class to the panel
 */
function applyCornerClass(el: HTMLElement, corner: CornerPosition): void {
  el.classList.remove('corner-bottom-right', 'corner-bottom-left', 'corner-top-right', 'corner-top-left')
  el.classList.add(`corner-${corner}`)
}

/**
 * Calculate the pixel position (top, left) for a given corner
 */
function getCornerPosition(corner: CornerPosition, panelWidth: number, panelHeight: number): { top: number; left: number } {
  const vpW = window.innerWidth
  const vpH = window.innerHeight
  const margin = 16

  switch (corner) {
    case 'top-left': return { top: margin, left: margin }
    case 'top-right': return { top: margin, left: vpW - panelWidth - margin }
    case 'bottom-left': return { top: vpH - panelHeight - margin, left: margin }
    case 'bottom-right': return { top: vpH - panelHeight - margin, left: vpW - panelWidth - margin }
  }
}

const DRAG_THRESHOLD = 5 // px of movement before we consider it a drag
const UNSNAP_THRESHOLD = 50 // px of mouse movement before panel breaks free
const DAMPING = 0.3 // Rubber-band resistance (panel moves at 30% of mouse displacement)
const FLICK_VELOCITY = 250 // px/s — momentum can override position-based corner pick
const VELOCITY_WINDOW = 80 // ms of recent motion to sample for velocity

interface PointerSample {
  x: number
  y: number
  t: number
}

/**
 * Pick a target corner that is NOT the original corner.
 * Uses the panel's current viewport quadrant, with momentum as a tiebreaker
 * when the panel is still in the original quadrant.
 */
function pickNonOriginalCorner(
  panelRect: DOMRect,
  vx: number,
  vy: number,
  original: CornerPosition,
): CornerPosition {
  const centerX = panelRect.left + panelRect.width / 2
  const centerY = panelRect.top + panelRect.height / 2
  const vpW = window.innerWidth
  const vpH = window.innerHeight

  // 1. Position-based: which quadrant is the panel center in?
  const isRight = centerX > vpW / 2
  const isBottom = centerY > vpH / 2
  const posCorner: CornerPosition = isBottom
    ? (isRight ? 'bottom-right' : 'bottom-left')
    : (isRight ? 'top-right' : 'top-left')

  if (posCorner !== original) return posCorner

  // 2. Momentum override: if fast enough, use flick direction
  const speed = Math.sqrt(vx * vx + vy * vy)
  if (speed >= FLICK_VELOCITY) {
    const flickCorner: CornerPosition = vy < 0
      ? (vx < 0 ? 'top-left' : 'top-right')
      : (vx < 0 ? 'bottom-left' : 'bottom-right')
    if (flickCorner !== original) return flickCorner
  }

  // 3. Fallback: still in the original quadrant with no strong momentum.
  //    Flip the axis closer to the midline (the direction the user was pulling).
  const xDist = Math.abs(centerX - vpW / 2)
  const yDist = Math.abs(centerY - vpH / 2)
  const [origV, origH] = original.split('-') as ['top' | 'bottom', 'left' | 'right']
  if (xDist < yDist) {
    // Closer to vertical midline → flip horizontal axis
    return `${origV}-${origH === 'right' ? 'left' : 'right'}` as CornerPosition
  }
  // Closer to horizontal midline → flip vertical axis
  return `${origV === 'bottom' ? 'top' : 'bottom'}-${origH}` as CornerPosition
}

/**
 * Set up drag-and-snap with rubber-band tension, unsnap, and
 * position/momentum-based corner selection.
 *
 * Phase 1 (< 50px mouse movement): Rubber-band — panel resists as if tethered.
 * Phase 2 (≥ 50px): Panel unsnaps and follows the mouse freely.
 *
 * On release:
 *   - Never unsnapped → snap back to original corner.
 *   - Unsnapped → pick the best non-original corner by position, with
 *     momentum as tiebreaker. The panel never returns to its starting corner.
 */
function setupDrag(panelEl: HTMLDivElement): void {
  const header = panelEl.querySelector('#scenetest-header') as HTMLElement
  if (!header) return

  let isDragging = false
  let hasUnsnapped = false
  let startX = 0
  let startY = 0
  let anchorX = 0 // Panel's resting left position before drag
  let anchorY = 0 // Panel's resting top position before drag
  let grabOffsetX = 0 // Offset from pointer to panel left edge (for free-follow)
  let grabOffsetY = 0
  let isAnimating = false
  const samples: PointerSample[] = []

  function onPointerDown(clientX: number, clientY: number): void {
    if (isAnimating) return
    const rect = panelEl.getBoundingClientRect()
    startX = clientX
    startY = clientY
    anchorX = rect.left
    anchorY = rect.top
    isDragging = false
    hasUnsnapped = false
    samples.length = 0
    samples.push({ x: clientX, y: clientY, t: performance.now() })
  }

  function onPointerMove(clientX: number, clientY: number): void {
    if (isAnimating) return
    const dx = clientX - startX
    const dy = clientY - startY

    if (!isDragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      isDragging = true
      panelEl.classList.add('dragging')
      // Switch to explicit top/left at current anchor position
      panelEl.style.top = anchorY + 'px'
      panelEl.style.left = anchorX + 'px'
      panelEl.style.bottom = 'auto'
      panelEl.style.right = 'auto'
      panelEl.classList.remove('corner-bottom-right', 'corner-bottom-left', 'corner-top-right', 'corner-top-left')
    }

    // Track velocity samples
    samples.push({ x: clientX, y: clientY, t: performance.now() })

    // Check for unsnap: once mouse moves far enough, panel breaks free
    if (!hasUnsnapped && Math.sqrt(dx * dx + dy * dy) >= UNSNAP_THRESHOLD) {
      hasUnsnapped = true
      // Use the original grab point so the panel jumps forward to reclaim
      // the 70% gap that was suppressed by damping — this is the "pop"
      grabOffsetX = startX - anchorX
      grabOffsetY = startY - anchorY
      // Animate the pop with a quick transition + shadow burst
      panelEl.classList.add('unsnapping')
      const onPop = (e: TransitionEvent) => {
        if (e.target === panelEl && e.propertyName === 'top') {
          panelEl.removeEventListener('transitionend', onPop)
          panelEl.classList.remove('unsnapping')
        }
      }
      panelEl.addEventListener('transitionend', onPop)
      setTimeout(() => panelEl.classList.remove('unsnapping'), 150)
    }

    if (hasUnsnapped) {
      // Free follow: panel tracks mouse 1:1
      panelEl.style.left = (clientX - grabOffsetX) + 'px'
      panelEl.style.top = (clientY - grabOffsetY) + 'px'
    } else {
      // Rubber-band: panel moves at DAMPING rate of mouse displacement
      panelEl.style.left = (anchorX + dx * DAMPING) + 'px'
      panelEl.style.top = (anchorY + dy * DAMPING) + 'px'
    }
  }

  function getVelocity(): { vx: number; vy: number } {
    const now = performance.now()
    const recent = samples.filter(s => now - s.t < VELOCITY_WINDOW)
    if (recent.length < 2) return { vx: 0, vy: 0 }
    const first = recent[0]
    const last = recent[recent.length - 1]
    const dt = (last.t - first.t) / 1000
    if (dt < 0.001) return { vx: 0, vy: 0 }
    return {
      vx: (last.x - first.x) / dt,
      vy: (last.y - first.y) / dt,
    }
  }

  function onPointerUp(): void {
    if (!isDragging || isAnimating) {
      isDragging = false
      return
    }

    panelEl.classList.remove('dragging')

    const { vx, vy } = getVelocity()
    let targetCorner: CornerPosition
    let isFlick: boolean

    if (hasUnsnapped) {
      // Panel broke free — must go to a non-original corner
      const rect = panelEl.getBoundingClientRect()
      targetCorner = pickNonOriginalCorner(rect, vx, vy, panelCorner)
      isFlick = true
    } else {
      // Didn't unsnap — rubber-band back to original
      targetCorner = panelCorner
      isFlick = false
    }

    // Calculate target pixel position
    const rect = panelEl.getBoundingClientRect()
    const dest = getCornerPosition(targetCorner, rect.width, rect.height)

    // Animate to target
    isAnimating = true
    panelEl.classList.add(isFlick ? 'flicking' : 'snapping')

    // Force reflow so the browser captures the current position before we set the target
    void panelEl.offsetHeight

    panelEl.style.top = dest.top + 'px'
    panelEl.style.left = dest.left + 'px'

    // Clean up after animation completes
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      panelEl.classList.remove('snapping', 'flicking')
      panelEl.style.top = ''
      panelEl.style.left = ''
      panelEl.style.bottom = ''
      panelEl.style.right = ''
      if (isFlick) setPanelCorner(targetCorner)
      applyCornerClass(panelEl, targetCorner)
      isAnimating = false
    }

    panelEl.addEventListener('transitionend', function onEnd(e: TransitionEvent) {
      if (e.target === panelEl && (e.propertyName === 'top' || e.propertyName === 'left')) {
        panelEl.removeEventListener('transitionend', onEnd)
        cleanup()
      }
    })
    // Fallback in case transitionend doesn't fire
    setTimeout(cleanup, isFlick ? 450 : 350)

    isDragging = false
  }

  // Mouse events
  header.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('scenetest-count')) return
    if (isAnimating) return

    e.preventDefault()
    onPointerDown(e.clientX, e.clientY)

    const onMouseMove = (ev: MouseEvent) => {
      ev.preventDefault()
      onPointerMove(ev.clientX, ev.clientY)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (!isDragging) {
        // It was a click, not a drag — toggle collapse
        panelEl.classList.toggle('collapsed')
      }
      onPointerUp()
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  // Touch events
  header.addEventListener('touchstart', (e: TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('scenetest-count')) return
    if (isAnimating) return

    const touch = e.touches[0]
    onPointerDown(touch.clientX, touch.clientY)

    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      onPointerMove(t.clientX, t.clientY)
      if (isDragging) ev.preventDefault()
    }
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      if (!isDragging) {
        panelEl.classList.toggle('collapsed')
      }
      onPointerUp()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }, { passive: true })
}

/**
 * Create and mount the floating panel
 */
export function createPanel(): void {
  const panelEl = document.createElement('div')
  panelEl.id = 'scenetest-panel'
  panelEl.innerHTML = getPanelHTML()
  document.body.appendChild(panelEl)

  setPanel(panelEl)
  setListEl(panelEl.querySelector('#scenetest-list')!)

  // Attach event listeners ONCE for the list content (uses event delegation)
  attachEventListeners(panelEl.querySelector('#scenetest-list') as HTMLElement, {
    openFullscreenToGroup: (groupId) => openFullscreen(groupId),
    openInEditor: (location) => openInEditor(location as any),
    toggleCollapsed: (groupId) => toggleGroupCollapsed(groupId),
  })

  // Apply initial corner position and set up drag-and-snap
  applyCornerClass(panelEl, panelCorner)
  setupDrag(panelEl)

  // Filter by clicking counts
  panelEl.querySelector('#scenetest-pass')?.addEventListener('click', (e) => {
    e.stopPropagation()
    handleSetFilter(filter === 'passes' ? 'all' : 'passes')
  })

  panelEl.querySelector('#scenetest-fail')?.addEventListener('click', (e) => {
    e.stopPropagation()
    handleSetFilter(filter === 'fails' ? 'all' : 'fails')
  })

  // Filter buttons
  panelEl.querySelector('#scenetest-filter-all')?.addEventListener('click', (e) => {
    e.stopPropagation()
    handleSetFilter('all')
  })

  panelEl.querySelector('#scenetest-filter-fails')?.addEventListener('click', (e) => {
    e.stopPropagation()
    handleSetFilter('fails')
  })

  // Clear button
  panelEl.querySelector('#scenetest-clear')?.addEventListener('click', (e) => {
    e.stopPropagation()
    clearAll()
    clearSymphony()
    updatePanel()
    updateFullscreenWindow()
  })

  // Fullscreen button
  panelEl.querySelector('#scenetest-fullscreen')?.addEventListener('click', (e) => {
    e.stopPropagation()
    openFullscreen()
  })

  // Audio: Mute toggle
  panelEl.querySelector('#scenetest-mute')?.addEventListener('click', (e) => {
    e.stopPropagation()
    // Initialize audio on first user interaction
    initAudio()
    const nowMuted = toggleMute()
    const muteBtn = panelEl.querySelector('#scenetest-mute')
    if (muteBtn) {
      muteBtn.textContent = nowMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
      muteBtn.classList.toggle('muted', nowMuted)
    }
  })

  // Audio: Play symphony
  panelEl.querySelector('#scenetest-play')?.addEventListener('click', (e) => {
    e.stopPropagation()
    // Initialize audio on first user interaction
    initAudio()

    const playBtn = panelEl.querySelector('#scenetest-play')
    if (isPlaying()) {
      stopSymphony()
      if (playBtn) {
        playBtn.textContent = '\u25B6'
        playBtn.classList.remove('playing')
      }
    } else {
      const info = getSymphonyInfo()
      if (info.eventCount === 0) {
        // Nothing to play
        return
      }
      playSymphony()
      if (playBtn) {
        playBtn.textContent = '\u23F9'
        playBtn.classList.add('playing')
      }

      // Set up callback for when symphony completes
      ;(window as any).__scenetest_symphonyComplete = () => {
        const btn = panel?.querySelector('#scenetest-play')
        if (btn) {
          btn.textContent = '\u25B6'
          btn.classList.remove('playing')
        }
      }
    }
  })
}

/**
 * Update the panel content
 */
export function updatePanel(): void {
  if (!panel || !listEl) return

  const passEl = panel.querySelector('#scenetest-pass')
  const failEl = panel.querySelector('#scenetest-fail')
  if (passEl) passEl.textContent = `\u2713 ${passCount}`
  if (failEl) failEl.textContent = `\u2717 ${failCount}`

  const filteredGroups = groups
    .map(g => ({
      ...g,
      items: filterItems(g.items),
    }))
    .filter(g => g.items.length > 0)

  if (filteredGroups.length === 0) {
    const message =
      filter === 'fails' ? 'No errors! All assertions passed.' : 'Click around to see inline assertions...'
    listEl.innerHTML = `<div id="scenetest-empty">${message}</div>`
    return
  }

  // Always show grouped view
  listEl.innerHTML = filteredGroups
    .map(g => renderPanelGroup(g))
    .reverse()
    .join('')
}
