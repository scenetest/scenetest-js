/**
 * Fullscreen window management
 */

import type { FilterMode } from './types'
import {
  groups,
  passCount,
  failCount,
  fullscreenWindow,
  filter,
  setFullscreenWindow,
  setFilter,
  clearAll,
  panel,
} from './state'
import { filterItems } from './utils'
import { renderFullscreenGroup } from './render'
import { fullscreenStyles } from './styles'
import { updatePanel } from './panel'

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
        <span id="title">scenetest</span>
        <div id="controls">
          <div id="counts">
            <span class="count pass" id="pass-count">\u2713 0</span>
            <span class="count fail" id="fail-count">\u2717 0</span>
          </div>
          <div id="filters" class="btn-group">
            <button class="btn active" id="filter-all">All</button>
            <button class="btn" id="filter-fails">Errors</button>
            <button class="btn" id="filter-passes">Passes</button>
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
    updatePanel()
    updateFullscreenWindow()
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

  const listEl = doc.getElementById('list')
  if (!listEl) return

  // Save scroll state before re-rendering
  // Find the first group visible in the viewport to anchor our scroll position
  const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
  const isScrolled = scrollTop > 50
  let anchorGroupId: number | null = null
  let anchorOffset = 0

  if (isScrolled) {
    const groupEls = listEl.querySelectorAll('[data-group-id]')
    for (const el of groupEls) {
      const rect = el.getBoundingClientRect()
      // Find the first group that's at or below the top of the viewport
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

  // Restore scroll position to keep the same group visible
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
