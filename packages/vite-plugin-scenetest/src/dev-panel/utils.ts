/**
 * Utility functions for the dev panel
 */

import type { AssertionResult, AssertionGroup, WatchResult } from './types'
import { filter } from './state'

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Format context object for display
 */
export function formatContext(ctx: Record<string, unknown> | undefined): string {
  if (!ctx) return ''
  try {
    return JSON.stringify(ctx, null, 2)
  } catch {
    return String(ctx)
  }
}

/**
 * Format source location for display
 */
export function formatLocation(loc: AssertionResult['location']): string {
  if (!loc) return ''
  const file = loc.file.replace(/^.*\/src\//, 'src/')
  return `${file}:${loc.line}${loc.column ? ':' + loc.column : ''}`
}

/**
 * Format timestamp for display
 */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

/**
 * Open file in editor using Vite's endpoint
 */
export function openInEditor(loc: AssertionResult['location']): void {
  if (!loc) return
  fetch(`/__open-in-editor?file=${encodeURIComponent(loc.file)}&line=${loc.line}${loc.column ? '&column=' + loc.column : ''}`)
    .catch(() => {
      // Fallback: try vscode:// protocol
      window.open(`vscode://file${loc.file}:${loc.line}${loc.column ? ':' + loc.column : ''}`)
    })
}

/**
 * Filter items based on current filter mode
 */
export function filterItems(items: AssertionResult[]): AssertionResult[] {
  if (filter === 'all') return items
  if (filter === 'fails') return items.filter(a => !a.result)
  if (filter === 'passes') return items.filter(a => a.result)
  return items
}

/**
 * Compute pass/fail counts from items
 */
export function getGroupStats(items: AssertionResult[]): { passCount: number; failCount: number } {
  let passCount = 0
  let failCount = 0
  for (const item of items) {
    if (item.result) passCount++
    else failCount++
  }
  return { passCount, failCount }
}

/**
 * Format a short location for the location row (just file basename + line)
 */
export function formatLocationShort(loc: AssertionResult['location']): string {
  if (!loc) return ''
  const file = loc.file.split('/').pop() || loc.file
  return `${file}:${loc.line}`
}

/**
 * Format watch result history as a visual indicator
 * Shows: [✗✗✓] settled on render 3
 */
export function formatWatchHistory(watch: WatchResult | undefined): string {
  if (!watch) return ''

  // Build history visualization: [✗✗✓✓✓]
  const historyViz = watch.history.map(r => r ? '\u2713' : '\u2717').join('')

  if (watch.settled) {
    return `[${historyViz}] settled on render ${watch.settledAtRender}`
  } else {
    return `[${historyViz}] not settled (${watch.history.length} renders)`
  }
}

/**
 * Format watch info for tooltip
 */
export function formatWatchTooltip(watch: WatchResult | undefined): string {
  if (!watch) return ''

  const lines: string[] = []
  lines.push(`Check: ${watch.settled ? 'Settled' : 'Not settled'}`)
  lines.push(`Renders: ${watch.history.length}`)
  if (watch.settledAtRender) {
    lines.push(`Settled at: render ${watch.settledAtRender}`)
  }
  lines.push(`History: ${watch.history.map((r, i) => `${i + 1}:${r ? 'pass' : 'fail'}`).join(', ')}`)

  return lines.join('\n')
}
