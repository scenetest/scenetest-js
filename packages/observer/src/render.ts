/**
 * Rendering functions for the dev panel
 *
 * SECURITY NOTE: These functions use data attributes instead of inline onclick
 * handlers to prevent XSS. Event listeners are attached via delegation in
 * attachEventListeners() after rendering.
 */

import type { AssertionResult, AssertionGroup, LocationGroup, LocationEntry } from './types.js'
import { getHistoryStats, formatHistorySummary, computeFlakyStats, computeResolutionStats, formatResolutionSummary, formatFlakyStatus } from './history.js'
import { escapeHtml, escapeHtmlAttr, formatContext, formatLocation, formatLocationShort, formatTime, getGroupStats } from './utils.js'
import { getNoteInfo } from './audio.js'

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
  const noteInfo = getNoteInfo(a.description)

  return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}"
         data-action="openFullscreenToGroup"
         data-group-id="${groupId}"
         title="${titleAttr}">
      <span class="scenetest-icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="scenetest-content">
        <div class="scenetest-desc${a.type === 'fail' && a.result ? ' negated' : ''}">${escapeHtml(a.description)}</div>
        ${a.location ? `<div class="scenetest-location">${escapeHtml(formatLocation(a.location))}</div>` : ''}
      </div>
      <span class="scenetest-note ${a.result ? 'pass' : 'fail'}" title="Musical note for this assertion">\u266A${noteInfo.noteName}</span>
    </div>
  `
}

/**
 * Render a single assertion item for the main panel (ungrouped, with time)
 */
export function renderPanelItemWithTime(a: AssertionResult): string {
  const histStats = getHistoryStats(a.description, a._index ?? 0)
  const histSummary = formatHistorySummary(histStats)
  const locJson = a.location ? escapeHtmlAttr(JSON.stringify(a.location)) : 'null'
  const titleAttr = a.context
    ? escapeHtml(formatContext(a.context))
    : a.location
      ? escapeHtml(formatLocation(a.location))
      : ''

  return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}"
         data-action="openInEditor"
         data-location="${locJson}"
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
      <div class="scenetest-group-header" data-action="toggleCollapsed">
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
  const locJson = a.location ? escapeHtmlAttr(JSON.stringify(a.location)) : 'null'
  const noteInfo = getNoteInfo(a.description)

  return `
    <div class="item ${a.result ? 'pass' : 'fail'}">
      <span class="icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="content">
        <div class="desc${a.type === 'fail' && a.result ? ' negated' : ''}" data-action="showSequence" data-key="${escapeHtmlAttr(JSON.stringify(a.description))}">${escapeHtml(a.description)}</div>
        ${a.location ? `<div class="location" data-action="openInEditorFullscreen" data-location="${locJson}">${escapeHtml(formatLocation(a.location))}</div>` : ''}
        ${histSummary ? `<div class="history">${histSummary}</div>` : ''}
        ${a.context ? `<div class="context">${escapeHtml(formatContext(a.context))}</div>` : ''}
        ${a.stack && !a.context ? `<div class="stack">${escapeHtml(a.stack.split('\n').slice(0, 3).join('\n'))}</div>` : ''}
      </div>
      <span class="note-badge ${a.result ? 'pass' : 'fail'}" title="Musical note: ${noteInfo.noteName}">\u266A${noteInfo.noteName}</span>
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
      <div class="group-header" data-action="toggleCollapsed">
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
  const keyJson = escapeHtmlAttr(JSON.stringify(group.key))
  const locJson = escapeHtmlAttr(JSON.stringify(group.location))
  const noteInfo = getNoteInfo(group.description)

  // Generate status dots (most recent 10 runs) with ✗ marker for failures
  const recentEntries = group.entries.slice(-10)
  const dots = recentEntries
    .map(e => {
      if (e.result) {
        return `<span class="status-dot pass" title="${formatTime(e.timestamp)}"></span>`
      } else {
        return `<span class="status-dot fail" title="${formatTime(e.timestamp)}"><span class="dot-x">\u2717</span></span>`
      }
    })
    .join('')

  // Determine overall status class and icon
  const hasAnyFails = failCount > 0
  const lastFailed = !group.lastResult
  const statusClass = lastFailed ? 'last-fail' : hasAnyFails ? 'has-fails' : 'all-pass'

  // Note badge class based on current state
  const noteBadgeClass = lastFailed ? 'fail' : hasAnyFails ? 'warn' : 'pass'

  // Current state icon - prominent indicator of current status
  const stateIcon = lastFailed
    ? '<span class="state-icon fail">\u2717</span>'
    : hasAnyFails
      ? '<span class="state-icon warn">\u26A0</span>'
      : '<span class="state-icon pass">\u2713</span>'

  // Compute flaky and resolution stats
  const flakyStats = computeFlakyStats(group.description)
  const resolutionStats = computeResolutionStats(group.description)

  // Build flaky info line
  let flakyInfo = ''
  if (flakyStats && flakyStats.isCurrentlyFailing) {
    // Currently failing - show failure rate
    flakyInfo = formatFlakyStatus(flakyStats)
  } else if (resolutionStats && resolutionStats.resolvedFailures.length > 0) {
    // Has resolved failures - show resolution summary
    flakyInfo = formatResolutionSummary(resolutionStats)
  }

  return `
    <div class="location-row ${statusClass}" data-action="showSequence" data-key="${keyJson}" data-location-key="${keyJson}" data-description="${escapeHtmlAttr(group.description)}" data-last-result="${group.lastResult}">
      ${stateIcon}
      <div class="location-main">
        <div class="location-info">
          <span class="location-file">${escapeHtml(formatLocationShort(group.location))}</span>
          <span class="location-desc">${escapeHtml(group.description)}</span>
          ${flakyInfo ? `<span class="flaky-info ${lastFailed ? 'failing' : 'resolved'}">${escapeHtml(flakyInfo)}</span>` : ''}
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
        <span class="note-badge clickable ${noteBadgeClass}" data-description="${escapeHtml(group.description)}" data-result="${group.lastResult}" title="Click to hear this note">\u266A${noteInfo.noteName}</span>
        <button class="loc-btn" data-action="openInEditorFullscreen" data-location="${locJson}" title="Open in editor">\u270E</button>
      </div>
    </div>
  `
}

/**
 * Render a piano roll visualization showing notes over time (chronological grid)
 * X axis = time (chords), Y axis = notes (pitch)
 */
export function renderPianoRoll(locations: LocationGroup[], allAssertions: AssertionResult[]): string {
  if (locations.length === 0 || allAssertions.length === 0) return ''

  // Group assertions by timestamp (within 50ms threshold)
  const GROUP_THRESHOLD = 50
  const chords: { timestamp: number; assertions: AssertionResult[] }[] = []

  const sortedAssertions = [...allAssertions].sort((a, b) => a.timestamp - b.timestamp)

  sortedAssertions.forEach(assertion => {
    const lastChord = chords[chords.length - 1]
    if (lastChord && assertion.timestamp - lastChord.timestamp < GROUP_THRESHOLD) {
      lastChord.assertions.push(assertion)
    } else {
      chords.push({ timestamp: assertion.timestamp, assertions: [assertion] })
    }
  })

  // Get unique notes sorted by pitch
  const noteMap = new Map<string, { noteInfo: ReturnType<typeof getNoteInfo>; description: string; hasAnyFails: boolean; lastResult: boolean }>()
  locations.forEach(loc => {
    const noteInfo = getNoteInfo(loc.description)
    const failCount = loc.entries.filter(e => !e.result).length
    noteMap.set(loc.description, {
      noteInfo,
      description: loc.description,
      hasAnyFails: failCount > 0,
      lastResult: loc.lastResult,
    })
  })

  const notes = Array.from(noteMap.values()).sort((a, b) => a.noteInfo.noteIndex - b.noteInfo.noteIndex)

  // Limit to last N chords to fit reasonably
  const maxChords = 30
  const displayChords = chords.slice(-maxChords)

  // Build the grid
  const rows = notes.map(note => {
    const statusClass = !note.lastResult ? 'fail' : note.hasAnyFails ? 'warn' : 'pass'

    const cells = displayChords.map((chord, colIdx) => {
      const match = chord.assertions.find(a => a.description === note.description)
      if (match) {
        const cellClass = match.result ? 'pass' : 'fail'
        return `<span class="piano-cell ${cellClass}" data-col="${colIdx}"></span>`
      }
      return `<span class="piano-cell empty" data-col="${colIdx}"></span>`
    }).join('')

    return `
      <div class="piano-row ${statusClass}" data-description="${escapeHtmlAttr(note.description)}" data-result="${note.lastResult}">
        <span class="piano-note">${note.noteInfo.noteName}</span>
        <div class="piano-cells">${cells}</div>
      </div>
    `
  }).join('')

  // Build chord data for click handlers (JSON encoded)
  const chordData = displayChords.map(chord => ({
    timestamp: chord.timestamp,
    notes: chord.assertions.map(a => ({
      description: a.description,
      result: a.result,
    })),
  }))

  return `
    <div class="piano-roll" data-chords="${escapeHtmlAttr(JSON.stringify(chordData))}">
      <div class="piano-roll-header">
        <span class="piano-roll-title">\uD83C\uDFB9 Piano Roll</span>
        <span class="piano-roll-hint">Click a column to hear that chord</span>
      </div>
      <div class="piano-grid">
        ${rows}
      </div>
      <div class="piano-timeline">
        <span class="piano-note"></span>
        <div class="piano-time-markers">
          ${displayChords.map((_, i) => `<span class="piano-time-marker" data-col="${i}"></span>`).join('')}
        </div>
      </div>
    </div>
  `
}

/**
 * Render a sequence entry for the "sequence" view
 * Shows a single run of an assertion at a specific location
 * isFirst/isLast are used to show timeline labels
 */
export function renderSequenceEntry(
  entry: LocationEntry,
  _location: AssertionResult['location'],
  isFirst: boolean = false,
  isLast: boolean = false
): string {
  const noteInfo = getNoteInfo(entry.description)

  return `
    <div class="sequence-entry ${entry.result ? 'pass' : 'fail'}" data-timestamp="${entry.timestamp}">
      <div class="timeline-track">
        <div class="timeline-line ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}"></div>
        <div class="timeline-dot ${entry.result ? 'pass' : 'fail'}">
          ${entry.result ? '' : '<span class="dot-x">\u2717</span>'}
        </div>
      </div>
      <div class="content">
        <div class="sequence-time chord-trigger" data-timestamp="${entry.timestamp}" title="Hover to hear this chord">
          ${formatTime(entry.timestamp)}
          <span class="chord-icon">\uD83C\uDFB5</span>
        </div>
        <div class="desc">${escapeHtml(entry.description)}</div>
        ${entry.context ? `<div class="context">${escapeHtml(formatContext(entry.context))}</div>` : ''}
      </div>
      <span class="note-badge ${entry.result ? 'pass' : 'fail'}" title="Musical note: ${noteInfo.noteName}">\u266A${noteInfo.noteName}</span>
    </div>
  `
}

/**
 * Render a chord tooltip showing all assertions that fired together
 */
export function renderChordTooltip(assertions: AssertionResult[]): string {
  if (assertions.length === 0) return ''

  const passes = assertions.filter(a => a.result).length
  const fails = assertions.length - passes

  return `
    <div class="chord-tooltip">
      <div class="chord-header">
        <span class="chord-title">\uD83C\uDFB5 Chord (${assertions.length} note${assertions.length === 1 ? '' : 's'})</span>
        <span class="chord-stats">
          ${passes > 0 ? `<span class="pass">\u2713${passes}</span>` : ''}
          ${fails > 0 ? `<span class="fail">\u2717${fails}</span>` : ''}
        </span>
      </div>
      <div class="chord-notes">
        ${assertions.map(a => {
          const noteInfo = getNoteInfo(a.description)
          return `
            <div class="chord-note ${a.result ? 'pass' : 'fail'}">
              <span class="note-indicator">\u266A${noteInfo.noteName}</span>
              <span class="note-desc">${escapeHtml(a.description)}</span>
              <span class="note-status">${a.result ? '\u2713' : '\u2717'}</span>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
}

/**
 * Render the sequence view header showing the location being tracked
 */
export function renderSequenceHeader(group: LocationGroup): string {
  const locJson = escapeHtmlAttr(JSON.stringify(group.location))
  const passCount = group.entries.filter(e => e.result).length
  const failCount = group.entries.filter(e => !e.result).length
  const noteInfo = getNoteInfo(group.description)

  // Determine status: flaky (has both), fail (only fails), or pass
  const isFlaky = passCount > 0 && failCount > 0
  const lastFailed = !group.lastResult
  const statusClass = lastFailed ? 'fail' : isFlaky ? 'warn' : 'pass'

  // State icon like in location rows
  const stateIcon = lastFailed
    ? '<span class="state-icon fail">\u2717</span>'
    : isFlaky
      ? '<span class="state-icon warn">\u26A0</span>'
      : '<span class="state-icon pass">\u2713</span>'

  // Compute flaky and resolution stats
  const flakyStats = computeFlakyStats(group.description)
  const resolutionStats = computeResolutionStats(group.description)

  // Build detailed flaky info lines
  let flakyStatusLine = ''
  let resolutionLine = ''

  if (flakyStats && flakyStats.isCurrentlyFailing) {
    flakyStatusLine = formatFlakyStatus(flakyStats)
  }

  if (resolutionStats && resolutionStats.resolvedFailures.length > 0) {
    resolutionLine = formatResolutionSummary(resolutionStats)
  }

  return `
    <div class="sequence-header ${statusClass}">
      ${stateIcon}
      <div class="sequence-info">
        <div class="sequence-location">
          <span class="sequence-file" data-action="openInEditorFullscreen" data-location="${locJson}">${escapeHtml(formatLocation(group.location))}</span>
        </div>
        <div class="sequence-desc">${escapeHtml(group.description)}</div>
        <div class="sequence-summary">
          <span class="sequence-total">${group.entries.length} run${group.entries.length === 1 ? '' : 's'}</span>
          <div class="sequence-stats">
            ${passCount > 0 ? `<span class="stat pass">\u2713 ${passCount}</span>` : ''}
            ${failCount > 0 ? `<span class="stat fail">\u2717 ${failCount}</span>` : ''}
          </div>
        </div>
        ${flakyStatusLine ? `<div class="flaky-status">${escapeHtml(flakyStatusLine)}</div>` : ''}
        ${resolutionLine ? `<div class="resolution-info">${escapeHtml(resolutionLine)}</div>` : ''}
      </div>
      <span class="note-badge clickable ${statusClass}" data-description="${escapeHtml(group.description)}" data-result="${group.lastResult}" title="Click to hear this note">\u266A${noteInfo.noteName}</span>
    </div>
  `
}

/**
 * Render the back button for sequence view
 */
export function renderBackButton(fromView: 'grouped' | 'byLocation' = 'byLocation'): string {
  const label = fromView === 'grouped' ? 'Back to timeline' : 'Back to all locations'
  return `<div class="back-btn" data-action="backToLocationView">\u2190 ${label}</div>`
}

/**
 * Attach event listeners to rendered elements using event delegation.
 * Call this after rendering HTML to a container.
 *
 * @param container - The container element (or document)
 * @param handlers - Object with handler functions
 */
export function attachEventListeners(
  container: Document | HTMLElement,
  handlers: {
    openFullscreenToGroup?: (groupId: number) => void
    openInEditor?: (location: unknown) => void
    openInEditorFullscreen?: (location: unknown) => void
    showSequence?: (key: string) => void
    backToLocationView?: () => void
    setViewMode?: (mode: string) => void
    toggleCollapsed?: (groupId: number) => void
  }
): void {
  const root = container instanceof Document ? container.body : container

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // Find the element with the data-action attribute
    const actionEl = target.closest('[data-action]') as HTMLElement | null
    if (!actionEl) return

    const action = actionEl.dataset.action

    switch (action) {
      case 'openFullscreenToGroup': {
        const groupId = parseInt(actionEl.dataset.groupId || '', 10)
        if (!isNaN(groupId) && handlers.openFullscreenToGroup) {
          handlers.openFullscreenToGroup(groupId)
        }
        break
      }

      case 'openInEditor': {
        const locStr = actionEl.dataset.location
        if (locStr && locStr !== 'null' && handlers.openInEditor) {
          try {
            const location = JSON.parse(locStr)
            handlers.openInEditor(location)
          } catch {
            // Invalid JSON, ignore
          }
        }
        break
      }

      case 'openInEditorFullscreen': {
        e.stopPropagation()
        const locStr = actionEl.dataset.location
        if (locStr && locStr !== 'null' && handlers.openInEditorFullscreen) {
          try {
            const location = JSON.parse(locStr)
            handlers.openInEditorFullscreen(location)
          } catch {
            // Invalid JSON, ignore
          }
        }
        break
      }

      case 'showSequence': {
        const key = actionEl.dataset.key
        if (key && handlers.showSequence) {
          try {
            const keyParsed = JSON.parse(key)
            handlers.showSequence(keyParsed)
          } catch {
            // Invalid JSON, ignore
          }
        }
        break
      }

      case 'backToLocationView': {
        if (handlers.backToLocationView) {
          handlers.backToLocationView()
        }
        break
      }

      case 'toggleCollapsed': {
        const parent = actionEl.parentElement
        if (parent) {
          parent.classList.toggle('collapsed')
          // Also update the state if a callback is provided
          const groupId = parseInt(parent.dataset.groupId || '', 10)
          if (!isNaN(groupId) && handlers.toggleCollapsed) {
            handlers.toggleCollapsed(groupId)
          }
        }
        break
      }
    }
  })
}
