/**
 * Core state machine for `useConverge()` — eventual-equality checks for
 * local-first UIs. Conceptually this is `match()` with a tolerance window:
 * within the window, mismatches are allowed while the target catches up.
 *
 * Framework-agnostic and side-effect-free by construction: timers, time,
 * and the reporter are injected so the same logic drives the React hook
 * in production and the vitest suite here.
 */

import type { AssertionResult } from './types.js'

export type ConvergePair = readonly [unknown, unknown]

export interface ConvergeOptions {
  /** How long the values have to converge before the check fails. Default 2000ms. */
  timeout?: number
  /**
   * Key that identifies the current "attempt". When it changes, a new
   * convergence window opens. Defaults to the array of client values
   * (each `pair[0]`), so mutating any client re-arms the check while its
   * target lags. Compared element-wise when both sides are arrays.
   */
  resetKey?: unknown
}

export interface ConvergeMeta {
  stack?: string
  location?: AssertionResult['location']
}

export interface ConvergeDeps {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  report: (r: AssertionResult) => void
}

export interface ObserveOptions {
  resetKey?: unknown
}

export interface Converger {
  observe(pairs: readonly ConvergePair[], opts?: ObserveOptions): void
  /** Cancel any pending timer. Call on unmount. */
  dispose(): void
}

function evaluate(pairs: readonly ConvergePair[]): boolean {
  return pairs.every(([a, b]) => a === b)
}

function diff(pairs: readonly ConvergePair[]): Record<string, unknown> {
  if (pairs.length === 1) {
    return { client: pairs[0][0], target: pairs[0][1] }
  }
  const mismatches = pairs
    .map(([client, target], index) => ({ index, client, target }))
    .filter(({ client, target }) => client !== target)
  return { mismatches }
}

function defaultKey(pairs: readonly ConvergePair[]): readonly unknown[] {
  return pairs.map((p) => p[0])
}

function keyEqual(prev: unknown, next: unknown): boolean {
  if (prev === next) return true
  if (Array.isArray(prev) && Array.isArray(next) && prev.length === next.length) {
    return prev.every((v, i) => v === next[i])
  }
  return false
}

export function createConverger(
  title: string,
  options: ConvergeOptions,
  meta: ConvergeMeta,
  deps: ConvergeDeps
): Converger {
  const timeout = options.timeout ?? 2000

  let currentPairs: readonly ConvergePair[] | null = null
  let windowKey: unknown = undefined
  let hasWindow = false
  let resolved = false
  let timer: unknown = null
  let windowStartedAt = 0

  function clearTimer() {
    if (timer !== null) {
      deps.clearTimeout(timer)
      timer = null
    }
  }

  function report(type: 'pass' | 'fail', pairs: readonly ConvergePair[]) {
    resolved = true
    clearTimer()
    const elapsed = deps.now() - windowStartedAt
    deps.report({
      type,
      description: title,
      result: type === 'pass',
      timestamp: deps.now(),
      stack: meta.stack,
      location: meta.location,
      context:
        type === 'pass'
          ? { convergedInMs: elapsed }
          : { ...diff(pairs), timeoutMs: timeout, elapsedMs: elapsed },
    })
  }

  function openWindow() {
    clearTimer()
    resolved = false
    windowStartedAt = deps.now()
    timer = deps.setTimeout(() => {
      timer = null
      if (resolved) return
      const pairs = currentPairs
      if (!pairs) return
      if (evaluate(pairs)) {
        report('pass', pairs)
      } else {
        report('fail', pairs)
      }
    }, timeout)
  }

  return {
    observe(pairs, opts) {
      currentPairs = pairs
      const key =
        opts && 'resetKey' in opts && opts.resetKey !== undefined
          ? opts.resetKey
          : defaultKey(pairs)
      const first = !hasWindow
      const keyChanged = hasWindow && !keyEqual(key, windowKey)
      windowKey = key
      hasWindow = true

      if (first || keyChanged) {
        if (evaluate(pairs)) {
          windowStartedAt = deps.now()
          report('pass', pairs)
        } else {
          openWindow()
        }
        return
      }

      if (resolved) return

      if (evaluate(pairs)) {
        report('pass', pairs)
      }
    },
    dispose() {
      clearTimer()
    },
  }
}
