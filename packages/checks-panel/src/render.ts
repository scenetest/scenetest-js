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
import { fileTreeCollapsed, FILE_TREE_GLOW_MS } from './state.js'

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
  const isServer = !!a.assertionId

  return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}${isServer ? ' server' : ''}"
         data-action="openFullscreenToGroup"
         data-group-id="${groupId}"
         title="${titleAttr}">
      <span class="scenetest-icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="scenetest-content">
        <div class="scenetest-desc${a.type === 'fail' && a.result ? ' negated' : ''}">${isServer ? '<span class="scenetest-server-badge">server</span>' : ''}${escapeHtml(a.description)}</div>
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
  const isServer = !!a.assertionId

  return `
    <div class="item ${a.result ? 'pass' : 'fail'}${isServer ? ' server' : ''}">
      <span class="icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="content">
        <div class="desc${a.type === 'fail' && a.result ? ' negated' : ''}" data-action="showSequence" data-key="${escapeHtmlAttr(JSON.stringify(a.description))}">${isServer ? '<span class="server-badge">server</span>' : ''}${escapeHtml(a.description)}</div>
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

// ---------------------------------------------------------------------------
// File Tree View
// ---------------------------------------------------------------------------

/**
 * A node in the file tree. Directories have children, files have assertions.
 */
export interface FileTreeNode {
  /** Display name for this segment (e.g. "App.tsx" or "components") */
  name: string
  /** Full relative path up to this node (used as collapse key) */
  path: string
  /** True if this is a leaf file node */
  isFile: boolean
  /** Child directory/file nodes */
  children: FileTreeNode[]
  /** Assertion groups that belong to this file (only for file nodes) */
  assertions: LocationGroup[]
  /** Aggregated status */
  status: 'pass' | 'fail' | 'warn'
  /** Most recent timestamp among all assertions in this subtree */
  lastTimestamp: number
  /** Total assertion count in this subtree */
  totalAssertions: number
  /** Total failures in this subtree */
  totalFailures: number
}

/**
 * Shorten a file path for display: strip everything up to and including /src/,
 * or everything before the last three segments.
 */
function shortenPath(file: string): string {
  const srcIdx = file.indexOf('/src/')
  if (srcIdx !== -1) return file.slice(srcIdx + 1) // "src/..."
  // Fallback: last 3 path segments
  const parts = file.split('/')
  return parts.slice(Math.max(0, parts.length - 3)).join('/')
}

/**
 * Build a file tree from location groups.
 *
 * Groups assertions by their `location.file`, constructs a trie from the path
 * segments, and compacts single-child directory chains (e.g. "src/components").
 */
export function buildFileTree(locations: LocationGroup[]): FileTreeNode[] {
  // Group by file path
  const byFile = new Map<string, LocationGroup[]>()
  for (const loc of locations) {
    const file = loc.location ? shortenPath(loc.location.file) : '(unknown)'
    let group = byFile.get(file)
    if (!group) {
      group = []
      byFile.set(file, group)
    }
    group.push(loc)
  }

  // Build trie
  interface TrieNode {
    name: string
    path: string
    children: Map<string, TrieNode>
    assertions: LocationGroup[]
  }

  const root: TrieNode = { name: '', path: '', children: new Map(), assertions: [] }

  for (const [filePath, locs] of byFile) {
    const parts = filePath.split('/')
    let current = root
    let pathSoFar = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      pathSoFar = pathSoFar ? pathSoFar + '/' + part : part
      let child = current.children.get(part)
      if (!child) {
        child = { name: part, path: pathSoFar, children: new Map(), assertions: [] }
        current.children.set(part, child)
      }
      current = child
    }

    // Leaf node: attach assertions
    current.assertions = locs
  }

  // Convert trie to FileTreeNode array, compacting single-child dirs
  function convert(trie: TrieNode): FileTreeNode {
    const isFile = trie.children.size === 0
    const children: FileTreeNode[] = []

    for (const child of trie.children.values()) {
      children.push(convert(child))
    }

    // Sort: directories first (alphabetical), then files (alphabetical)
    children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
      return a.name.localeCompare(b.name)
    })

    // Compute aggregate stats
    let totalAssertions = 0
    let totalFailures = 0
    let lastTimestamp = 0

    if (isFile) {
      for (const loc of trie.assertions) {
        totalAssertions += loc.entries.length
        totalFailures += loc.entries.filter(e => !e.result).length
        if (loc.lastTimestamp > lastTimestamp) lastTimestamp = loc.lastTimestamp
      }
    } else {
      for (const child of children) {
        totalAssertions += child.totalAssertions
        totalFailures += child.totalFailures
        if (child.lastTimestamp > lastTimestamp) lastTimestamp = child.lastTimestamp
      }
    }

    const hasAnyFails = totalFailures > 0
    // Determine if any assertion is currently failing
    const anyCurrentFail = isFile
      ? trie.assertions.some(a => !a.lastResult)
      : children.some(c => c.status === 'fail')
    const status: 'pass' | 'fail' | 'warn' = anyCurrentFail ? 'fail' : hasAnyFails ? 'warn' : 'pass'

    return {
      name: trie.name,
      path: trie.path,
      isFile,
      children,
      assertions: trie.assertions,
      status,
      lastTimestamp,
      totalAssertions,
      totalFailures,
    }
  }

  // Convert root's children (skip the empty root node)
  const topLevel: FileTreeNode[] = []
  for (const child of root.children.values()) {
    topLevel.push(convert(child))
  }

  // Compact: if a directory has a single child directory, merge names
  function compact(node: FileTreeNode): FileTreeNode {
    if (!node.isFile && node.children.length === 1 && !node.children[0].isFile) {
      const child = node.children[0]
      return compact({
        ...child,
        name: node.name + '/' + child.name,
        // Keep the child's path since it's the full path
      })
    }
    return {
      ...node,
      children: node.children.map(compact),
    }
  }

  return topLevel.map(compact).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Render the full file tree view.
 */
export function renderFileTree(tree: FileTreeNode[]): string {
  if (tree.length === 0) return ''

  return `
    <div class="file-tree">
      ${tree.map(node => renderFileTreeNode(node, 0)).join('')}
    </div>
  `
}

/**
 * Render a single file tree node (directory or file) recursively.
 */
function renderFileTreeNode(node: FileTreeNode, depth: number): string {
  const now = Date.now()
  const isActive = now - node.lastTimestamp < FILE_TREE_GLOW_MS
  const isCollapsed = fileTreeCollapsed.has(node.path)
  const pathJson = escapeHtmlAttr(JSON.stringify(node.path))

  if (node.isFile) {
    // File node with assertions underneath
    const fileStatusIcon = node.status === 'fail'
      ? '<span class="ft-status-icon fail">\u2717</span>'
      : node.status === 'warn'
        ? '<span class="ft-status-icon warn">\u26A0</span>'
        : '<span class="ft-status-icon pass">\u2713</span>'

    const assertionCount = node.assertions.reduce((sum, a) => sum + a.entries.length, 0)

    return `
      <div class="ft-node ft-file ${node.status}${isActive ? ' ft-active' : ''}${isCollapsed ? ' ft-collapsed' : ''}"
           style="--depth: ${depth}">
        <div class="ft-file-header" data-action="toggleFileTree" data-tree-path="${pathJson}">
          <span class="ft-indent" style="width: ${depth * 16}px"></span>
          <span class="ft-toggle">${isCollapsed ? '\u25B6' : '\u25BC'}</span>
          <span class="ft-file-icon">\uD83D\uDCC4</span>
          ${fileStatusIcon}
          <span class="ft-name">${escapeHtml(node.name)}</span>
          <span class="ft-badge">${assertionCount}</span>
        </div>
        ${!isCollapsed ? `
          <div class="ft-assertions">
            ${node.assertions
              .sort((a, b) => b.lastTimestamp - a.lastTimestamp)
              .map(loc => renderFileTreeAssertion(loc, depth + 1))
              .join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  // Directory node
  const dirStatusIcon = node.status === 'fail'
    ? '<span class="ft-status-icon fail">\u2717</span>'
    : node.status === 'warn'
      ? '<span class="ft-status-icon warn">\u26A0</span>'
      : '<span class="ft-status-icon pass">\u2713</span>'

  return `
    <div class="ft-node ft-dir ${node.status}${isActive ? ' ft-active' : ''}${isCollapsed ? ' ft-collapsed' : ''}"
         style="--depth: ${depth}">
      <div class="ft-dir-header" data-action="toggleFileTree" data-tree-path="${pathJson}">
        <span class="ft-indent" style="width: ${depth * 16}px"></span>
        <span class="ft-toggle">${isCollapsed ? '\u25B6' : '\u25BC'}</span>
        <span class="ft-dir-icon">${isCollapsed ? '\uD83D\uDCC1' : '\uD83D\uDCC2'}</span>
        ${dirStatusIcon}
        <span class="ft-name">${escapeHtml(node.name)}</span>
        <span class="ft-badge">${node.totalAssertions}</span>
        ${node.totalFailures > 0 ? `<span class="ft-fail-badge">${node.totalFailures} \u2717</span>` : ''}
      </div>
      ${!isCollapsed ? `
        <div class="ft-children">
          ${node.children.map(child => renderFileTreeNode(child, depth + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `
}

/**
 * Render a single assertion row inside a file tree file node.
 */
function renderFileTreeAssertion(group: LocationGroup, depth: number): string {
  const now = Date.now()
  const isActive = now - group.lastTimestamp < FILE_TREE_GLOW_MS
  const keyJson = escapeHtmlAttr(JSON.stringify(group.key))
  const lastFailed = !group.lastResult
  const hasAnyFails = group.entries.some(e => !e.result)
  const statusClass = lastFailed ? 'fail' : hasAnyFails ? 'warn' : 'pass'
  const total = group.entries.length
  const line = group.location?.line

  const statusIcon = lastFailed
    ? '<span class="ft-assert-icon fail">\u2717</span>'
    : hasAnyFails
      ? '<span class="ft-assert-icon warn">\u26A0</span>'
      : '<span class="ft-assert-icon pass">\u2713</span>'

  // Recent status dots (last 5)
  const recentEntries = group.entries.slice(-5)
  const dots = recentEntries
    .map(e => `<span class="ft-dot ${e.result ? 'pass' : 'fail'}"></span>`)
    .join('')

  return `
    <div class="ft-assertion ${statusClass}${isActive ? ' ft-active' : ''}"
         data-action="showSequence" data-key="${keyJson}"
         style="--depth: ${depth}">
      <span class="ft-indent" style="width: ${depth * 16}px"></span>
      ${statusIcon}
      <span class="ft-assert-desc">${escapeHtml(group.description)}</span>
      ${line ? `<span class="ft-assert-line">:${line}</span>` : ''}
      <span class="ft-dots">${dots}</span>
      <span class="ft-assert-count">${total}x</span>
    </div>
  `
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
    toggleFileTree?: (path: string) => void
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

      case 'toggleFileTree': {
        const treePath = actionEl.dataset.treePath
        if (treePath && handlers.toggleFileTree) {
          try {
            const pathParsed = JSON.parse(treePath)
            handlers.toggleFileTree(pathParsed)
          } catch {
            // Invalid JSON, ignore
          }
        }
        break
      }
    }
  })
}
