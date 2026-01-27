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
 * Determine which corner to snap to based on the panel's current center position
 */
function getTargetCorner(panelRect: DOMRect): CornerPosition {
  const centerX = panelRect.left + panelRect.width / 2
  const centerY = panelRect.top + panelRect.height / 2
  const vpW = window.innerWidth
  const vpH = window.innerHeight

  const isRight = centerX > vpW / 2
  const isBottom = centerY > vpH / 2

  if (isBottom && isRight) return 'bottom-right'
  if (isBottom && !isRight) return 'bottom-left'
  if (!isBottom && isRight) return 'top-right'
  return 'top-left'
}

const DRAG_THRESHOLD = 5 // px of movement before we consider it a drag

/**
 * Set up drag-and-snap behavior on the panel header.
 * Differentiates click (toggle collapse) from drag (reposition).
 * Supports both mouse and touch events.
 */
function setupDrag(panelEl: HTMLDivElement): void {
  const header = panelEl.querySelector('#scenetest-header') as HTMLElement
  if (!header) return

  let isDragging = false
  let startX = 0
  let startY = 0
  let offsetX = 0
  let offsetY = 0

  function onPointerDown(clientX: number, clientY: number): void {
    const rect = panelEl.getBoundingClientRect()
    startX = clientX
    startY = clientY
    offsetX = clientX - rect.left
    offsetY = clientY - rect.top
    isDragging = false
  }

  function onPointerMove(clientX: number, clientY: number): void {
    const dx = clientX - startX
    const dy = clientY - startY

    if (!isDragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      isDragging = true
      panelEl.classList.add('dragging')
      // Switch to top/left positioning for smooth dragging
      const rect = panelEl.getBoundingClientRect()
      panelEl.style.top = rect.top + 'px'
      panelEl.style.left = rect.left + 'px'
      panelEl.style.bottom = 'auto'
      panelEl.style.right = 'auto'
      panelEl.classList.remove('corner-bottom-right', 'corner-bottom-left', 'corner-top-right', 'corner-top-left')
    }

    const newLeft = clientX - offsetX
    const newTop = clientY - offsetY
    panelEl.style.left = newLeft + 'px'
    panelEl.style.top = newTop + 'px'
  }

  function onPointerUp(): void {
    if (isDragging) {
      panelEl.classList.remove('dragging')
      // Read position before clearing inline styles
      const rect = panelEl.getBoundingClientRect()
      const corner = getTargetCorner(rect)
      // Clear inline positioning and apply corner class
      panelEl.style.top = ''
      panelEl.style.left = ''
      panelEl.style.bottom = ''
      panelEl.style.right = ''
      setPanelCorner(corner)
      applyCornerClass(panelEl, corner)
    }
    isDragging = false
  }

  // Mouse events
  header.addEventListener('mousedown', (e: MouseEvent) => {
    // Ignore clicks on interactive children (count badges, etc.)
    const target = e.target as HTMLElement
    if (target.classList.contains('scenetest-count')) return

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
