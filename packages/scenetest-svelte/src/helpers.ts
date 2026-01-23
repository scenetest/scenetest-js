import type { AssertionConfig, AssertionResult, WatchResult } from 'scenetest'

/**
 * Svelte helper for multi-context assertions.
 * Use this inside a $effect() block for reactive assertions.
 *
 * @example
 * ```svelte
 * <script>
 * import { runAssert, pass } from 'scenetest-svelte'
 *
 * let profile = $state(null)
 *
 * $effect(() => {
 *   if (!profile) return
 *
 *   runAssert({
 *     title: 'Email validation',
 *     withData: () => ({ email: profile.email }),
 *     serverFn: (server, data) => {
 *       pass('email is valid', server.validateEmail(data.email))
 *     },
 *   })
 * })
 * </script>
 * ```
 *
 * For simple assertions, just use pass() and fail() directly:
 * ```svelte
 * <script>
 * import { pass, fail } from 'scenetest-svelte'
 *
 * let count = $state(0)
 *
 * $effect(() => {
 *   pass('count is non-negative', count >= 0)
 * })
 * </script>
 * ```
 */
export function runAssert<TData>(
  _config: AssertionConfig<TData>
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __runAssert after transform
 */
export interface RuntimeAssertConfig {
  __assertionId: string
  title: string
  key?: string
  withData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime helper called after transform.
 * The transform extracts serverFn and replaces runAssert with this.
 */
export function __runAssert(config: RuntimeAssertConfig): void {
  // Skip if enabled is explicitly false
  if (config.enabled === false) return

  // Import dynamically to avoid circular deps
  import('scenetest/runtime').then(({ __scenetest_rpc }) => {
    __scenetest_rpc({
      id: config.__assertionId,
      title: config.title,
      key: config.key,
      withData: config.withData,
    })
  })
}

/**
 * Options for watch tracker
 */
export interface WatchOptions {
  /** Optional context data for debugging */
  context?: Record<string, unknown>
}

/**
 * Internal state for watch tracking
 */
interface WatchState {
  history: boolean[]
  settled: boolean
  settledAtRender?: number
}

/**
 * Get stack trace for the watch call
 */
function getWatchStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined
  const lines = stack.split('\n').slice(3)
  return lines.join('\n')
}

/**
 * Parse location from stack trace
 */
function parseWatchLocation(stack: string | undefined): AssertionResult['location'] {
  if (!stack) return undefined
  const match = stack.match(/(?:at\s+)?(?:\S+\s+\()?(?:https?:\/\/[^/]+)?([^:)]+):(\d+)(?::(\d+))?/)
  if (!match) return undefined
  return {
    file: match[1],
    line: parseInt(match[2], 10),
    column: match[3] ? parseInt(match[3], 10) : undefined,
  }
}

/**
 * Report a watch assertion result
 */
function reportWatch(
  description: string,
  watchState: WatchState,
  stack: string | undefined,
  context?: Record<string, unknown>
): void {
  if (typeof window === 'undefined' || !window.__scenetest_report) return

  const watch: WatchResult = {
    settled: watchState.settled,
    history: [...watchState.history],
    settledAtRender: watchState.settledAtRender,
  }

  window.__scenetest_report({
    type: 'pass',
    description,
    result: watchState.settled,
    timestamp: Date.now(),
    stack,
    context,
    location: parseWatchLocation(stack),
    watch,
  })
}

/**
 * Watch tracker that can be used inside $effect to track when a condition settles.
 */
export interface WatchTracker {
  /**
   * Check a condition and update the watch state.
   * Call this inside $effect with a boolean condition.
   */
  check: (condition: boolean) => void
  /**
   * Report final state if never settled. Call in cleanup.
   */
  finalize: () => void
  /**
   * Whether the condition has settled (became true at least once)
   */
  readonly settled: boolean
  /**
   * History of condition results
   */
  readonly history: readonly boolean[]
}

/**
 * Create a watch tracker for tracking when a condition settles in Svelte.
 *
 * Use this to track when a condition eventually becomes true.
 * Call tracker.check() inside $effect, and optionally tracker.finalize()
 * in cleanup to report if values never settled.
 *
 * @example
 * ```svelte
 * <script>
 * import { watch } from 'scenetest-svelte'
 *
 * let { userId } = $props()
 * let localId = $state('')
 *
 * const tracker = watch('props and state should sync')
 *
 * $effect(() => {
 *   tracker.check(userId === localId)
 *   return () => tracker.finalize()
 * })
 *
 * $effect(() => {
 *   localId = userId
 * })
 * </script>
 * ```
 */
export function watch(description: string, options?: WatchOptions): WatchTracker {
  const state: WatchState = {
    history: [],
    settled: false,
    settledAtRender: undefined,
  }

  const stack = getWatchStack()

  return {
    check(condition: boolean) {
      // Update history
      state.history.push(condition)

      // Check if settled
      if (condition && !state.settled) {
        state.settled = true
        state.settledAtRender = state.history.length
      }

      // Report current state
      reportWatch(description, state, stack, options?.context)
    },

    finalize() {
      if (!state.settled) {
        reportWatch(description, state, stack, {
          ...options?.context,
          _unmountedWithoutSettling: true,
        })
      }
    },

    get settled() {
      return state.settled
    },

    get history() {
      return state.history
    },
  }
}
