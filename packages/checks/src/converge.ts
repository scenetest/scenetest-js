/**
 * Core state machine for `useConverge()` — eventual-equality checks for
 * local-first UIs. Framework-agnostic and side-effect-free by construction:
 * timers, time, and the reporter are injected so the same logic drives the
 * React hook in production and the unit tests here in vitest.
 *
 * See `react.ts` for the hook wrapper and public docs.
 */

import type { AssertionResult } from './types.js'

/**
 * A convergence check is either a `[client, target]` pair (strict equality),
 * or an arbitrary predicate — useful with `match()` for multi-field checks.
 */
export type ConvergeCheck = readonly [unknown, unknown] | (() => boolean)

export interface ConvergeOptions {
  /**
   * How long the values have to converge before the check fails.
   * Defaults to 2000ms.
   */
  timeout?: number
  /**
   * Key that identifies the current "attempt". When it changes, a new
   * convergence window opens (fresh timeout, fresh chance to pass). When
   * omitted:
   * - pair form: defaults to the first element (the client value), so mutating
   *   the client re-arms the check while the target lags.
   * - predicate form: no auto-reset within a single mount.
   */
  resetKey?: unknown
}

export interface ConvergeMeta {
  /** Captured at the hook call site so the panel can jump to source. */
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
  /**
   * Per-observation reset key. `undefined` means "use the default" (pair[0]
   * for pair form, `null` for predicate form). Pass any other value —
   * including `null` — to override.
   */
  resetKey?: unknown
}

export interface Converger {
  observe(check: ConvergeCheck, opts?: ObserveOptions): void
  /** Cancel any pending timer. Call on unmount. */
  dispose(): void
}

function evaluate(check: ConvergeCheck): boolean {
  if (typeof check === 'function') {
    try {
      return !!check()
    } catch {
      return false
    }
  }
  return check[0] === check[1]
}

function diff(check: ConvergeCheck): Record<string, unknown> {
  if (typeof check === 'function') {
    return { note: 'convergence predicate never returned true' }
  }
  return { client: check[0], target: check[1] }
}

function defaultKey(check: ConvergeCheck): unknown {
  return typeof check === 'function' ? null : check[0]
}

export function createConverger(
  title: string,
  options: ConvergeOptions,
  meta: ConvergeMeta,
  deps: ConvergeDeps
): Converger {
  const timeout = options.timeout ?? 2000

  let currentCheck: ConvergeCheck | null = null
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

  function report(type: 'pass' | 'fail', check: ConvergeCheck) {
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
          : { ...diff(check), timeoutMs: timeout, elapsedMs: elapsed },
    })
  }

  function openWindow(check: ConvergeCheck) {
    clearTimer()
    resolved = false
    windowStartedAt = deps.now()
    timer = deps.setTimeout(() => {
      timer = null
      if (resolved) return
      const check = currentCheck
      if (!check) return
      if (evaluate(check)) {
        report('pass', check)
      } else {
        report('fail', check)
      }
    }, timeout)
  }

  return {
    observe(check, opts) {
      currentCheck = check
      const key = opts && 'resetKey' in opts && opts.resetKey !== undefined
        ? opts.resetKey
        : defaultKey(check)
      const first = !hasWindow
      const keyChanged = hasWindow && key !== windowKey
      windowKey = key
      hasWindow = true

      if (first || keyChanged) {
        // New window. If the values already match, resolve immediately.
        if (evaluate(check)) {
          windowStartedAt = deps.now()
          report('pass', check)
        } else {
          openWindow(check)
        }
        return
      }

      // Same window. If already resolved, we're done for this attempt.
      if (resolved) return

      // Still open — did the values just now converge?
      if (evaluate(check)) {
        report('pass', check)
      }
    },
    dispose() {
      clearTimer()
    },
  }
}
