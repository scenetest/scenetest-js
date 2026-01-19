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
          <div id="filters">
            <button class="btn active" id="filter-all">All</button>
            <button class="btn" id="filter-fails">Errors Only</button>
            <button class="btn" id="filter-passes">Passes Only</button>
          </div>
          <button class="btn" id="scenetest-clear-full">Clear All</button>
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
 * Open the fullscreen window
 */
export function openFullscreen(): void {
  if (fullscreenWindow && !fullscreenWindow.closed) {
    fullscreenWindow.focus()
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
}
