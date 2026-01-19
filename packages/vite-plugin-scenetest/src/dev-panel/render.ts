/**
 * Rendering functions for the dev panel
 */

import type { AssertionResult, AssertionGroup } from './types'
import { getHistoryStats, formatHistorySummary } from './history'
import { escapeHtml, formatContext, formatLocation, formatTime, getGroupStats } from './utils'

/**
 * Render a single assertion item for the main panel
 */
export function renderPanelItem(a: AssertionResult): string {
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
            ${stats.passCount > 0 ? `<span class="scenetest-group-stat pass">\u2713${stats.passCount}</span>` : ''}
            ${stats.failCount > 0 ? `<span class="scenetest-group-stat fail">\u2717${stats.failCount}</span>` : ''}
          </div>
        </div>
        <span class="scenetest-group-toggle">\u25BC</span>
      </div>
      <div class="scenetest-group-items">
        ${g.items.map(a => renderPanelItem(a)).join('')}
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
