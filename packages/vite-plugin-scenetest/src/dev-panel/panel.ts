/**
 * Main panel UI management
 */

import type { FilterMode } from './types'
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
} from './state'
import { filterItems } from './utils'
import { renderPanelGroup } from './render'
import { panelStyles } from './styles'
import { openFullscreen, updateFullscreenWindow } from './fullscreen'

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
 * Create and mount the floating panel
 */
export function createPanel(): void {
  const panelEl = document.createElement('div')
  panelEl.id = 'scenetest-panel'
  panelEl.innerHTML = getPanelHTML()
  document.body.appendChild(panelEl)

  setPanel(panelEl)
  setListEl(panelEl.querySelector('#scenetest-list')!)

  // Toggle collapse
  panelEl.querySelector('#scenetest-header')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('scenetest-count')) return
    panelEl.classList.toggle('collapsed')
  })

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
    updatePanel()
    updateFullscreenWindow()
  })

  // Fullscreen button
  panelEl.querySelector('#scenetest-fullscreen')?.addEventListener('click', (e) => {
    e.stopPropagation()
    openFullscreen()
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
