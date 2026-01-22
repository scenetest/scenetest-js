/**
 * Rendering functions for the dev panel
 */

import type { AssertionResult, AssertionGroup, LocationGroup, LocationEntry } from './types'
import { getHistoryStats, formatHistorySummary } from './history'
import { escapeHtml, formatContext, formatLocation, formatLocationShort, formatTime, getGroupStats } from './utils'

/**
 * Render a single assertion item for the main panel
 * Click opens fullscreen view, no history shown (history only in fullscreen)
 */
export function renderPanelItem(a: AssertionResult, groupId: number): string {
  const titleAttr = a.context
    ? escapeHtml(formatContext(a.context))
    : a.location
      ? escapeHtml(formatLocation(a.location))
      : ''

  return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}"
         onclick="if(window.__scenetest_openFullscreenToGroup)window.__scenetest_openFullscreenToGroup(${groupId})"
         title="${titleAttr}">
      <span class="scenetest-icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="scenetest-content">
        <div class="scenetest-desc${a.type === 'fail' && a.result ? ' negated' : ''}">${escapeHtml(a.description)}</div>
        ${a.location ? `<div class="scenetest-location">${escapeHtml(formatLocation(a.location))}</div>` : ''}
      </div>
    </div>
  `
}

/**
 * Render a single assertion item for the main panel (ungrouped, with time)
 */
export function renderPanelItemWithTime(a: AssertionResult): string {
  const histStats = getHistoryStats(a.description, a._index ?? 0)
  const histSummary = formatHistorySummary(histStats)
  const locJson = a.location ? JSON.stringify(a.location).replace(/"/g, '&quot;') : 'null'
  const titleAttr = a.context
    ? escapeHtml(formatContext(a.context))
    : a.location
      ? escapeHtml(formatLocation(a.location))
      : ''

  return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}"
         onclick="if(window.__scenetest_openInEditor)window.__scenetest_openInEditor(${locJson})"
         title="${titleAttr}">
      <span class="scenetest-icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="scenetest-content">
        <div class="scenetest-desc${a.type === 'fail' && a.result ? ' negated' : ''}">${escapeHtml(a.description)}</div>
        ${a.location ? `<div class="scenetest-location">${escapeHtml(formatLocation(a.location))}</div>` : ''}
        ${histSummary ? `<div class="scenetest-history">${histSummary}</div>` : ''}
      </div>
      <span class="scenetest-time">${formatTime(a.timestamp)}</span>
    </div>
  `
}

/**
 * Render a group of assertions for the main panel
 */
export function renderPanelGroup(g: AssertionGroup): string {
  const stats = getGroupStats(g.items)

  return `
    <div class="scenetest-group${g.collapsed ? ' collapsed' : ''}" data-group-id="${g.id}">
      <div class="scenetest-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div class="scenetest-group-summary">
          <span class="scenetest-group-time">${formatTime(g.timestamp)}</span>
          <div class="scenetest-group-stats">
            <span class="scenetest-group-stat pass">\u2713${stats.passCount}</span>
            <span class="scenetest-group-stat ${stats.failCount > 0 ? 'fail' : 'zero'}">\u2717${stats.failCount}</span>
          </div>
        </div>
        <span class="scenetest-group-toggle">\u25BC</span>
      </div>
      <div class="scenetest-group-items">
        ${g.items.map(a => renderPanelItem(a, g.id)).join('')}
      </div>
    </div>
  `
}

/**
 * Render a single assertion item for fullscreen view
 */
export function renderFullscreenItem(a: AssertionResult): string {
  const histStats = getHistoryStats(a.description, a._index ?? 0)
  const histSummary = formatHistorySummary(histStats)
  const locJson = a.location ? JSON.stringify(a.location).replace(/"/g, '&quot;') : 'null'

  return `
    <div class="item ${a.result ? 'pass' : 'fail'}">
      <span class="icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="content">
        <div class="desc${a.type === 'fail' && a.result ? ' negated' : ''}">${escapeHtml(a.description)}</div>
        ${a.location ? `<div class="location" onclick="window.opener && window.opener.__scenetest_openInEditor && window.opener.__scenetest_openInEditor(${locJson})">${escapeHtml(formatLocation(a.location))}</div>` : ''}
        ${histSummary ? `<div class="history">${histSummary}</div>` : ''}
        ${a.context ? `<div class="context">${escapeHtml(formatContext(a.context))}</div>` : ''}
        ${a.stack && !a.context ? `<div class="stack">${escapeHtml(a.stack.split('\n').slice(0, 3).join('\n'))}</div>` : ''}
      </div>
    </div>
  `
}

/**
 * Render a group of assertions for fullscreen view
 */
export function renderFullscreenGroup(g: AssertionGroup): string {
  const stats = getGroupStats(g.items)

  return `
    <div class="group" data-group-id="${g.id}">
      <div class="group-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div class="group-info">
          <span class="group-time">${formatTime(g.timestamp)}</span>
          <div class="group-stats">
            ${stats.passCount > 0 ? `<span class="group-stat pass">\u2713 ${stats.passCount}</span>` : ''}
            ${stats.failCount > 0 ? `<span class="group-stat fail">\u2717 ${stats.failCount}</span>` : ''}
          </div>
          <span style="color: #6a6a8a">${g.items.length} assertion${g.items.length === 1 ? '' : 's'}</span>
        </div>
        <span class="group-toggle">\u25BC</span>
      </div>
      <div class="group-items">
        ${g.items.map(a => renderFullscreenItem(a)).join('')}
      </div>
    </div>
  `
}

/**
 * Render a location row for the "by location" view
 * Shows one row per unique code location with status dots
 */
export function renderLocationRow(group: LocationGroup): string {
  const passCount = group.entries.filter(e => e.result).length
  const failCount = group.entries.filter(e => !e.result).length
  const total = group.entries.length
  const keyJson = JSON.stringify(group.key).replace(/"/g, '&quot;')

  // Generate status dots (most recent 10 runs)
  const recentEntries = group.entries.slice(-10)
  const dots = recentEntries
    .map(e => `<span class="status-dot ${e.result ? 'pass' : 'fail'}" title="${formatTime(e.timestamp)}"></span>`)
    .join('')

  // Determine overall status class
  const hasAnyFails = failCount > 0
  const lastFailed = !group.lastResult
  const statusClass = lastFailed ? 'last-fail' : hasAnyFails ? 'has-fails' : 'all-pass'

  return `
    <div class="location-row ${statusClass}" data-location-key="${keyJson}">
      <div class="location-main" onclick="window.opener ? window.opener.__scenetest_showSequence && window.opener.__scenetest_showSequence(${keyJson}) : window.__scenetest_showSequence && window.__scenetest_showSequence(${keyJson})">
        <div class="location-info">
          <span class="location-file">${escapeHtml(formatLocationShort(group.location))}</span>
          <span class="location-desc">${escapeHtml(group.description)}</span>
        </div>
        <div class="location-stats">
          <div class="status-dots">${dots}</div>
          <span class="location-count">${total} run${total === 1 ? '' : 's'}</span>
          <div class="location-summary">
            ${passCount > 0 ? `<span class="stat pass">\u2713${passCount}</span>` : ''}
            ${failCount > 0 ? `<span class="stat fail">\u2717${failCount}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="location-actions">
        <button class="loc-btn" onclick="event.stopPropagation(); window.opener ? window.opener.__scenetest_openInEditor && window.opener.__scenetest_openInEditor(${JSON.stringify(group.location).replace(/"/g, '&quot;')}) : window.__scenetest_openInEditor && window.__scenetest_openInEditor(${JSON.stringify(group.location).replace(/"/g, '&quot;')})" title="Open in editor">\u270E</button>
      </div>
    </div>
  `
}

/**
 * Render a sequence entry for the "sequence" view
 * Shows a single run of an assertion at a specific location
 */
export function renderSequenceEntry(entry: LocationEntry, location: AssertionResult['location']): string {
  return `
    <div class="sequence-entry ${entry.result ? 'pass' : 'fail'}">
      <span class="icon">${entry.result ? '\u2713' : '\u2717'}</span>
      <div class="content">
        <div class="sequence-time">${formatTime(entry.timestamp)}</div>
        <div class="desc">${escapeHtml(entry.description)}</div>
        ${entry.context ? `<div class="context">${escapeHtml(formatContext(entry.context))}</div>` : ''}
      </div>
    </div>
  `
}

/**
 * Render the sequence view header showing the location being tracked
 */
export function renderSequenceHeader(group: LocationGroup): string {
  const locJson = JSON.stringify(group.location).replace(/"/g, '&quot;')
  const passCount = group.entries.filter(e => e.result).length
  const failCount = group.entries.filter(e => !e.result).length

  return `
    <div class="sequence-header">
      <div class="sequence-location">
        <span class="sequence-file" onclick="window.opener ? window.opener.__scenetest_openInEditor && window.opener.__scenetest_openInEditor(${locJson}) : window.__scenetest_openInEditor && window.__scenetest_openInEditor(${locJson})">${escapeHtml(formatLocation(group.location))}</span>
      </div>
      <div class="sequence-summary">
        <span class="sequence-total">${group.entries.length} run${group.entries.length === 1 ? '' : 's'}</span>
        <div class="sequence-stats">
          ${passCount > 0 ? `<span class="stat pass">\u2713 ${passCount}</span>` : ''}
          ${failCount > 0 ? `<span class="stat fail">\u2717 ${failCount}</span>` : ''}
        </div>
      </div>
    </div>
  `
}
