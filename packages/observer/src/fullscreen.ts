/**
 * Fullscreen window management
 */

import type { FilterMode, ViewMode } from './types.js'
import {
  groups,
  passCount,
  failCount,
  fullscreenWindow,
  filter,
  viewMode,
  sequenceLocationKey,
  locationGroups,
  setFullscreenWindow,
  setFilter,
  setViewMode,
  setSequenceLocation,
  clearAll,
  panel,
} from './state.js'
import { filterItems } from './utils.js'
import { renderFullscreenGroup, renderLocationRow, renderSequenceEntry, renderSequenceHeader, renderChordTooltip } from './render.js'
import { fullscreenStyles } from './styles.js'
import { updatePanel } from './panel.js'
import {
  clearSymphony,
  playSymphony,
  stopSymphony,
  toggleMute,
  isPlaying,
  getSymphonyInfo,
  initAudio,
  playGroupChord,
} from './audio.js'
import { assertions, GROUP_THRESHOLD_MS } from './state.js'

/**
 * Get the HTML for the fullscreen window
 */
function getFullscreenHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>scenetest - Inline Assertions</title>
      <style>${fullscreenStyles}</style>
    </head>
    <body>
      <div id="header">
        <span id="title"><span class="icon"><span>\uD83C\uDFAC</span></span>scenetest</span>
        <div id="controls">
          <div id="counts">
            <span class="count pass" id="pass-count">\u2713 0</span>
            <span class="count fail" id="fail-count">\u2717 0</span>
          </div>
          <div id="view-modes" class="btn-group">
            <button class="btn active" id="view-grouped" title="Group by time">Timeline</button>
            <button class="btn" id="view-byLocation" title="Group by code location">By Location</button>
          </div>
          <div id="filters" class="btn-group">
            <button class="btn active" id="filter-all">All</button>
            <button class="btn" id="filter-fails">Errors</button>
            <button class="btn" id="filter-passes">Passes</button>
          </div>
          <span class="separator"></span>
          <div id="audio-controls" class="btn-group">
            <button class="btn audio-btn" id="audio-mute" title="Toggle sound">\uD83D\uDD0A</button>
            <button class="btn audio-btn" id="audio-play" title="Play symphony">\u25B6</button>
          </div>
          <span class="separator"></span>
          <button class="btn" id="scenetest-clear-full">Clear</button>
        </div>
      </div>
      <div id="list">
        <div id="empty">
          <div id="empty-icon">\uD83C\uDFAC</div>
          <div>Interact with your app to see inline assertions appear here...</div>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Set filter from fullscreen and sync to main panel
 */
function setFullscreenFilter(newFilter: FilterMode): void {
  setFilter(newFilter)
  if (panel) {
    panel.querySelector('#scenetest-filter-all')?.classList.toggle('active', filter === 'all')
    panel.querySelector('#scenetest-filter-fails')?.classList.toggle('active', filter === 'fails')
    panel.querySelector('#scenetest-pass')?.classList.toggle('active', filter === 'passes')
    panel.querySelector('#scenetest-fail')?.classList.toggle('active', filter === 'fails')
  }
  updatePanel()
  updateFullscreenWindow()
}

/**
 * Set view mode from fullscreen
 */
function setFullscreenViewMode(newMode: ViewMode): void {
  setViewMode(newMode)
  updateFullscreenWindow()
}

/**
 * Show sequence view for a specific location
 */
export function showSequence(locationKey: string): void {
  setSequenceLocation(locationKey)
  updateFullscreenWindow()
}

/**
 * Go back from sequence view to byLocation view
 */
export function backToLocationView(): void {
  setViewMode('byLocation')
  updateFullscreenWindow()
}

// Track which group to scroll to after fullscreen opens
let scrollToGroupId: number | null = null

/**
 * Open the fullscreen window and optionally scroll to a specific group
 */
export function openFullscreen(groupId?: number): void {
  scrollToGroupId = groupId ?? null

  if (fullscreenWindow && !fullscreenWindow.closed) {
    fullscreenWindow.focus()
    if (scrollToGroupId !== null) {
      scrollToGroup(scrollToGroupId)
    }
    return
  }

  const win = window.open('', 'scenetest-fullscreen', 'width=900,height=700')
  if (!win) {
    alert('Please allow popups for this site to use fullscreen mode.')
    return
  }

  setFullscreenWindow(win)
  win.document.write(getFullscreenHTML())
  win.document.close()

  // Set up event handlers
  const doc = win.document

  doc.getElementById('scenetest-clear-full')?.addEventListener('click', () => {
    clearAll()
    clearSymphony()
    updatePanel()
    updateFullscreenWindow()
  })

  // Audio controls
  doc.getElementById('audio-mute')?.addEventListener('click', () => {
    initAudio()
    const nowMuted = toggleMute()
    const muteBtn = doc.getElementById('audio-mute')
    if (muteBtn) {
      muteBtn.textContent = nowMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
      muteBtn.classList.toggle('muted', nowMuted)
    }
    // Sync with main panel
    const panelMuteBtn = panel?.querySelector('#scenetest-mute')
    if (panelMuteBtn) {
      panelMuteBtn.textContent = nowMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
      panelMuteBtn.classList.toggle('muted', nowMuted)
    }
  })

  doc.getElementById('audio-play')?.addEventListener('click', () => {
    initAudio()
    const playBtn = doc.getElementById('audio-play')
    if (isPlaying()) {
      stopSymphony()
      if (playBtn) {
        playBtn.textContent = '\u25B6'
        playBtn.classList.remove('playing')
      }
    } else {
      const info = getSymphonyInfo()
      if (info.eventCount === 0) return
      playSymphony()
      if (playBtn) {
        playBtn.textContent = '\u23F9'
        playBtn.classList.add('playing')
      }

      // Set up callback for when symphony completes
      ;(window as any).__scenetest_symphonyComplete = () => {
        const btn = doc.getElementById('audio-play')
        if (btn) {
          btn.textContent = '\u25B6'
          btn.classList.remove('playing')
        }
        // Also update main panel button
        const panelBtn = panel?.querySelector('#scenetest-play')
        if (panelBtn) {
          panelBtn.textContent = '\u25B6'
          panelBtn.classList.remove('playing')
        }
      }
    }
  })

  doc.getElementById('filter-all')?.addEventListener('click', () => {
    setFullscreenFilter('all')
  })

  doc.getElementById('filter-fails')?.addEventListener('click', () => {
    setFullscreenFilter('fails')
  })

  doc.getElementById('filter-passes')?.addEventListener('click', () => {
    setFullscreenFilter('passes')
  })

  // View mode handlers
  doc.getElementById('view-grouped')?.addEventListener('click', () => {
    setFullscreenViewMode('grouped')
  })

  doc.getElementById('view-byLocation')?.addEventListener('click', () => {
    setFullscreenViewMode('byLocation')
  })

  updateFullscreenWindow()

  // Scroll to group if requested
  if (scrollToGroupId !== null) {
    scrollToGroup(scrollToGroupId)
    scrollToGroupId = null
  }
}

/**
 * Scroll to a specific group in the fullscreen window and highlight it
 */
function scrollToGroup(groupId: number): void {
  if (!fullscreenWindow || fullscreenWindow.closed) return
  const doc = fullscreenWindow.document
  const groupEl = doc.querySelector(`[data-group-id="${groupId}"]`)
  if (groupEl) {
    // Expand the group if collapsed
    groupEl.classList.remove('collapsed')
    // Scroll into view
    groupEl.scrollIntoView({ behavior: 'auto', block: 'start' })
    // Clear any previous highlight and add to this group
    const prevHighlighted = doc.querySelector('.group.highlighted')
    if (prevHighlighted) prevHighlighted.classList.remove('highlighted')
    groupEl.classList.add('highlighted')
  }
}

/**
 * Open fullscreen and scroll to a specific group (called from small panel item clicks)
 */
export function openFullscreenToGroup(groupId: number): void {
  openFullscreen(groupId)
}

/**
 * Update the fullscreen window content
 */
export function updateFullscreenWindow(): void {
  if (!fullscreenWindow || fullscreenWindow.closed) return

  const doc = fullscreenWindow.document
  const passCountEl = doc.getElementById('pass-count')
  const failCountEl = doc.getElementById('fail-count')

  if (passCountEl) passCountEl.textContent = `\u2713 ${passCount}`
  if (failCountEl) failCountEl.textContent = `\u2717 ${failCount}`

  // Update filter button states
  doc.getElementById('filter-all')?.classList.toggle('active', filter === 'all')
  doc.getElementById('filter-fails')?.classList.toggle('active', filter === 'fails')
  doc.getElementById('filter-passes')?.classList.toggle('active', filter === 'passes')

  // Update view mode button states
  const isSequenceView = viewMode === 'sequence'
  doc.getElementById('view-grouped')?.classList.toggle('active', viewMode === 'grouped')
  doc.getElementById('view-byLocation')?.classList.toggle('active', viewMode === 'byLocation' || isSequenceView)

  const listEl = doc.getElementById('list')
  if (!listEl) return

  // Render based on view mode
  if (viewMode === 'sequence' && sequenceLocationKey) {
    renderSequenceView(doc, listEl)
    return
  }

  if (viewMode === 'byLocation') {
    renderByLocationView(doc, listEl)
    return
  }

  // Default: grouped (timeline) view
  renderGroupedView(doc, listEl)
}

/**
 * Render the grouped (timeline) view
 */
function renderGroupedView(doc: Document, listEl: HTMLElement): void {
  // Save scroll state before re-rendering
  const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
  const isScrolled = scrollTop > 50
  let anchorGroupId: number | null = null
  let anchorOffset = 0

  if (isScrolled) {
    const groupEls = listEl.querySelectorAll('[data-group-id]')
    for (const el of groupEls) {
      const rect = el.getBoundingClientRect()
      if (rect.top >= -rect.height / 2) {
        anchorGroupId = parseInt(el.getAttribute('data-group-id') || '', 10)
        anchorOffset = rect.top
        break
      }
    }
  }

  const filteredGroups = groups
    .map(g => ({
      ...g,
      items: filterItems(g.items),
    }))
    .filter(g => g.items.length > 0)

  if (filteredGroups.length === 0) {
    const icon = filter === 'fails' ? '\u2713' : '\uD83C\uDFAC'
    const message =
      filter === 'fails'
        ? 'No errors! All assertions passed.'
        : 'Interact with your app to see inline assertions appear here...'
    listEl.innerHTML = `
      <div id="empty">
        <div id="empty-icon">${icon}</div>
        <div>${message}</div>
      </div>
    `
    return
  }

  listEl.innerHTML = filteredGroups
    .map(g => renderFullscreenGroup(g))
    .reverse()
    .join('')

  // Restore scroll position
  if (anchorGroupId !== null) {
    const anchorEl = listEl.querySelector(`[data-group-id="${anchorGroupId}"]`)
    if (anchorEl) {
      const newRect = anchorEl.getBoundingClientRect()
      const scrollAdjustment = newRect.top - anchorOffset
      doc.documentElement.scrollTop += scrollAdjustment
      doc.body.scrollTop += scrollAdjustment
    }
  }
}

/**
 * Render the "by location" view showing one row per unique code location
 */
function renderByLocationView(_doc: Document, listEl: HTMLElement): void {
  // Get all location groups and sort by most recent activity
  const locations = Array.from(locationGroups.values())
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp)

  // Apply filter
  let filteredLocations = locations
  if (filter === 'fails') {
    filteredLocations = locations.filter(loc => loc.entries.some(e => !e.result))
  } else if (filter === 'passes') {
    filteredLocations = locations.filter(loc => loc.entries.some(e => e.result))
  }

  if (filteredLocations.length === 0) {
    const icon = filter === 'fails' ? '\u2713' : '\uD83C\uDFAC'
    const message =
      filter === 'fails'
        ? 'No errors! All assertions passed.'
        : 'Interact with your app to see inline assertions appear here...'
    listEl.innerHTML = `
      <div id="empty">
        <div id="empty-icon">${icon}</div>
        <div>${message}</div>
      </div>
    `
    return
  }

  listEl.innerHTML = `
    <div class="location-list">
      ${filteredLocations.map(loc => renderLocationRow(loc)).join('')}
    </div>
  `
}

/**
 * Render the sequence view for a specific location
 */
function renderSequenceView(_doc: Document, listEl: HTMLElement): void {
  const group = locationGroups.get(sequenceLocationKey!)
  if (!group) {
    // Location no longer exists, go back
    setViewMode('byLocation')
    renderByLocationView(_doc, listEl)
    return
  }

  // Apply filter to entries
  let entries = group.entries
  if (filter === 'fails') {
    entries = entries.filter(e => !e.result)
  } else if (filter === 'passes') {
    entries = entries.filter(e => e.result)
  }

  const backHandler = `window.opener ? window.opener.__scenetest_setViewMode && window.opener.__scenetest_setViewMode('byLocation') : window.__scenetest_setViewMode && window.__scenetest_setViewMode('byLocation')`

  // Reverse entries so most recent is at top
  const reversedEntries = entries.slice().reverse()
  const entryCount = reversedEntries.length

  listEl.innerHTML = `
    <div class="back-btn" onclick="${backHandler}">\u2190 Back to all locations</div>
    ${renderSequenceHeader(group)}
    <div class="sequence-direction-hint">
      <span class="direction-arrow">\u2191</span> Most recent at top
    </div>
    <div class="sequence-list">
      ${reversedEntries.map((entry, i) => {
        const isFirst = i === 0 // Most recent (top)
        const isLast = i === entryCount - 1 // Oldest (bottom)
        return renderSequenceEntry(entry, group.location, isFirst, isLast)
      }).join('')}
    </div>
    ${entryCount > 1 ? '<div class="sequence-end-label">First event</div>' : ''}
  `

  // Set up chord hover handlers
  setupChordHoverHandlers(_doc, listEl)
}

/**
 * Find all assertions that fired at approximately the same time (within GROUP_THRESHOLD_MS)
 */
function findChordSiblings(timestamp: number): typeof assertions {
  return assertions.filter(
    a => Math.abs(a.timestamp - timestamp) <= GROUP_THRESHOLD_MS
  )
}

/**
 * Set up hover handlers for chord triggers in the sequence view
 */
function setupChordHoverHandlers(doc: Document, listEl: HTMLElement): void {
  let tooltipEl: HTMLElement | null = null
  let hideTimeout: ReturnType<typeof setTimeout> | null = null

  const chordTriggers = listEl.querySelectorAll('.chord-trigger')

  chordTriggers.forEach(trigger => {
    trigger.addEventListener('mouseenter', (e) => {
      const target = e.target as HTMLElement
      const timestamp = parseInt(target.dataset.timestamp || '0', 10)
      if (!timestamp) return

      // Clear any pending hide
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }

      // Find all assertions in this chord
      const chordMembers = findChordSiblings(timestamp)
      if (chordMembers.length === 0) return

      // Initialize audio and play the chord
      initAudio()
      playGroupChord(chordMembers)

      // Create and show tooltip
      if (tooltipEl) {
        tooltipEl.remove()
      }

      tooltipEl = doc.createElement('div')
      tooltipEl.innerHTML = renderChordTooltip(chordMembers)
      const tooltip = tooltipEl.firstElementChild as HTMLElement
      if (tooltip) {
        doc.body.appendChild(tooltip)

        // Position tooltip near the trigger
        const rect = target.getBoundingClientRect()
        tooltip.style.left = `${rect.right + 12}px`
        tooltip.style.top = `${rect.top - 8}px`

        // Adjust if off-screen
        const tooltipRect = tooltip.getBoundingClientRect()
        if (tooltipRect.right > window.innerWidth - 20) {
          tooltip.style.left = `${rect.left - tooltipRect.width - 12}px`
        }
        if (tooltipRect.bottom > window.innerHeight - 20) {
          tooltip.style.top = `${window.innerHeight - tooltipRect.height - 20}px`
        }

        tooltipEl = tooltip
      }
    })

    trigger.addEventListener('mouseleave', () => {
      // Delay hiding to allow moving to tooltip
      hideTimeout = setTimeout(() => {
        if (tooltipEl) {
          tooltipEl.remove()
          tooltipEl = null
        }
      }, 200)
    })
  })

  // Also hide tooltip when clicking elsewhere
  doc.addEventListener('click', () => {
    if (tooltipEl) {
      tooltipEl.remove()
      tooltipEl = null
    }
  })
}
