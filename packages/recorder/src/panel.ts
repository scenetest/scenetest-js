/**
 * Sidebar panel UI for the recorder.
 *
 * Shows a left-side panel with:
 * - Recording indicator
 * - Live DSL lines accumulating as the user interacts
 * - Inline assertion annotations
 * - Delete buttons on each line
 * - Export button
 */

import type { DslLine, AssertionAnnotation } from './types.js'
import { recorderStyles } from './styles.js'

let panelEl: HTMLDivElement | null = null
let linesEl: HTMLElement | null = null
let footerCountEl: HTMLElement | null = null
let isCollapsed = false

/**
 * Highlight DSL syntax in a line of text
 */
function highlightDsl(text: string): string {
  const parts = text.split(' ')
  const action = parts[0]

  // Actions that take only a value (no selector)
  const valueOnlyActions = ['openTo', 'seeText', 'wait', 'emit']
  // Actions that take selector + value
  const selectorValueActions = ['typeInto', 'select', 'warnIf']
  // No-arg actions
  const noArgActions = ['prev', 'scrollToBottom']

  let html = `<span class="recorder-action">${escapeHtml(action)}</span>`

  if (noArgActions.includes(action) || parts.length === 1) {
    return html
  }

  if (valueOnlyActions.includes(action)) {
    html += ` <span class="recorder-value">${escapeHtml(parts.slice(1).join(' '))}</span>`
  } else if (selectorValueActions.includes(action)) {
    html += ` <span class="recorder-selector">${escapeHtml(parts[1])}</span>`
    if (parts.length > 2) {
      html += ` <span class="recorder-value">${escapeHtml(parts.slice(2).join(' '))}</span>`
    }
  } else {
    // Selector-only actions (see, click, check, notSee, seeToast, up)
    html += ` <span class="recorder-selector">${escapeHtml(parts.slice(1).join(' '))}</span>`
  }

  return html
}

/**
 * Render a single DSL line with `- ` prefix (formal markdown DSL format)
 */
function renderLine(line: DslLine, index: number): string {
  return `<div class="recorder-line new" data-line-id="${line.id}">
    <span class="recorder-line-number">${index + 1}</span>
    <div class="recorder-line-content">
      <span class="recorder-line-text"><span class="recorder-prefix">- </span>${highlightDsl(line.text)}</span>
    </div>
    <button class="recorder-line-delete" data-delete-id="${line.id}" title="Remove line">\u00d7</button>
  </div>`
}

/**
 * Render an assertion annotation
 */
function renderAnnotation(annotation: AssertionAnnotation): string {
  const icon = annotation.type === 'pass' ? '\u2713' : '\u2717'
  return `<div class="recorder-annotation ${annotation.type}">
    <span class="recorder-annotation-icon">${icon}</span>
    <span class="recorder-annotation-text">${escapeHtml(annotation.description)}</span>
  </div>`
}

/**
 * Create and mount the recorder panel
 */
export function createRecorderPanel(): HTMLDivElement {
  const el = document.createElement('div')
  el.id = 'scenetest-recorder'
  el.innerHTML = `
    <style>${recorderStyles}</style>
    <div class="recorder-header">
      <div class="recorder-header-left">
        <div class="recorder-rec-dot" id="recorder-rec-dot"></div>
        <span class="recorder-header-title">scene recorder</span>
      </div>
      <button class="recorder-toggle-btn" id="recorder-toggle" title="Collapse">\u25C0</button>
    </div>
    <div class="recorder-actions">
      <button class="recorder-btn active" id="recorder-record-btn">record</button>
      <button class="recorder-btn" id="recorder-pause-btn">pause</button>
      <button class="recorder-btn danger" id="recorder-clear-btn">clear</button>
      <button class="recorder-btn primary" id="recorder-export-btn">export .spec.md</button>
    </div>
    <div class="recorder-lines" id="recorder-lines">
      <div class="recorder-empty">
        <div class="recorder-empty-icon">\u23FA</div>
        Click around the app to start recording...<br>
        Actions appear here as markdown DSL.
      </div>
    </div>
    <div class="recorder-footer">
      <span class="recorder-line-count" id="recorder-line-count">0 lines</span>
    </div>
  `

  document.body.appendChild(el)
  panelEl = el
  linesEl = el.querySelector('#recorder-lines')
  footerCountEl = el.querySelector('#recorder-line-count')

  // Set CSS variable for app to adjust layout
  document.documentElement.style.setProperty('--scenetest-recorder-width', '360px')

  return el
}

/**
 * Attach event listeners to the panel.
 * Separated from creation so the caller can wire up callbacks.
 */
export function attachPanelListeners(opts: {
  onToggleRecording: () => void
  onPause: () => void
  onClear: () => void
  onExport: () => void
  onDeleteLine: (lineId: number) => void
}): void {
  if (!panelEl) return

  // Toggle collapse
  panelEl.querySelector('#recorder-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation()
    isCollapsed = !isCollapsed
    panelEl?.classList.toggle('collapsed', isCollapsed)
    const btn = panelEl?.querySelector('#recorder-toggle')
    if (btn) {
      btn.textContent = isCollapsed ? '\u25B6' : '\u25C0'
      btn.setAttribute('title', isCollapsed ? 'Expand' : 'Collapse')
    }
    document.documentElement.style.setProperty(
      '--scenetest-recorder-width',
      isCollapsed ? '48px' : '360px'
    )
  })

  // Record button
  panelEl.querySelector('#recorder-record-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onToggleRecording()
  })

  // Pause button
  panelEl.querySelector('#recorder-pause-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onPause()
  })

  // Clear button
  panelEl.querySelector('#recorder-clear-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onClear()
  })

  // Export button
  panelEl.querySelector('#recorder-export-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onExport()
  })

  // Delete line (event delegation on the lines container)
  linesEl?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const deleteBtn = target.closest('[data-delete-id]') as HTMLElement | null
    if (deleteBtn) {
      e.stopPropagation()
      const lineId = parseInt(deleteBtn.getAttribute('data-delete-id')!, 10)
      opts.onDeleteLine(lineId)
    }
  })
}

/**
 * Add a new DSL line to the panel
 */
export function appendLine(line: DslLine, index: number): void {
  if (!linesEl) return

  // Remove the empty state message if present
  const emptyEl = linesEl.querySelector('.recorder-empty')
  if (emptyEl) {
    emptyEl.remove()
  }

  const lineHtml = renderLine(line, index)
  linesEl.insertAdjacentHTML('beforeend', lineHtml)

  // Scroll to bottom
  linesEl.scrollTop = linesEl.scrollHeight

  updateLineCount(index + 1)
}

/**
 * Add an assertion annotation after the last line
 */
export function appendAnnotation(annotation: AssertionAnnotation): void {
  if (!linesEl) return

  const html = renderAnnotation(annotation)
  linesEl.insertAdjacentHTML('beforeend', html)

  // Scroll to bottom
  linesEl.scrollTop = linesEl.scrollHeight
}

/**
 * Add a warning message to the panel
 */
export function appendWarning(message: string): void {
  if (!linesEl) return

  const html = `<div class="recorder-warning">
    <span class="recorder-warning-icon">\u26A0</span>
    <span>${escapeHtml(message)}</span>
  </div>`
  linesEl.insertAdjacentHTML('beforeend', html)
  linesEl.scrollTop = linesEl.scrollHeight
}

/**
 * Remove a line from the panel by id
 */
export function removeLine(lineId: number): void {
  if (!linesEl) return

  const lineEl = linesEl.querySelector(`[data-line-id="${lineId}"]`)
  if (lineEl) {
    lineEl.remove()
  }

  // Re-number remaining lines
  const lines = linesEl.querySelectorAll('.recorder-line')
  lines.forEach((el, i) => {
    const numEl = el.querySelector('.recorder-line-number')
    if (numEl) {
      numEl.textContent = String(i + 1)
    }
  })

  updateLineCount(lines.length)
}

/**
 * Clear all lines and annotations from the panel
 */
export function clearPanel(): void {
  if (!linesEl) return

  linesEl.innerHTML = `<div class="recorder-empty">
    <div class="recorder-empty-icon">\u23FA</div>
    Click around the app to start recording...<br>
    Actions appear here as markdown DSL.
  </div>`

  updateLineCount(0)
}

/**
 * Update recording state indicator
 */
export function setRecordingState(recording: boolean): void {
  if (!panelEl) return

  const dot = panelEl.querySelector('#recorder-rec-dot')
  const recordBtn = panelEl.querySelector('#recorder-record-btn')
  const pauseBtn = panelEl.querySelector('#recorder-pause-btn')

  dot?.classList.toggle('paused', !recording)

  recordBtn?.classList.toggle('active', recording)
  pauseBtn?.classList.toggle('active', !recording)
}

/**
 * Re-render all lines (after deletion or reorder)
 */
export function renderAllLines(lines: DslLine[], annotations: AssertionAnnotation[]): void {
  if (!linesEl) return

  if (lines.length === 0) {
    clearPanel()
    return
  }

  let html = ''
  for (let i = 0; i < lines.length; i++) {
    html += renderLine(lines[i], i)

    // Add any annotations that belong after this line
    const lineAnnotations = annotations.filter(a => a.afterLineId === lines[i].id)
    for (const ann of lineAnnotations) {
      html += renderAnnotation(ann)
    }
  }

  // Add any trailing annotations (after the last line)
  const lastLineId = lines[lines.length - 1].id
  const trailingAnnotations = annotations.filter(a => a.afterLineId > lastLineId)
  for (const ann of trailingAnnotations) {
    html += renderAnnotation(ann)
  }

  linesEl.innerHTML = html
  updateLineCount(lines.length)
}

function updateLineCount(count: number): void {
  if (footerCountEl) {
    footerCountEl.textContent = `${count} line${count !== 1 ? 's' : ''}`
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
