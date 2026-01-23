import { useEffect, useRef } from 'react'
import type { AssertionConfig, AssertionResult, WatchResult } from 'scenetest'

/**
 * React hook for multi-context assertions.
 * Takes the same config shape as assert(). Use `enabled: false` to skip.
 *
 * @example
 * ```tsx
 * useAssert({
 *   title: 'Email validation',
 *   withData: () => ({ email: profile.email }),
 *   serverFn: (server, data) => {
 *     should('email should be valid', server.validateEmail(data.email))
 *   },
 *   enabled: !isLoading,
 * }, [isLoading, profile?.email])
 * ```
 */
export function useAssert<TData>(
  _config: AssertionConfig<TData>,
  _deps: React.DependencyList
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __useAssert after transform
 */
export interface RuntimeAssertConfig {
  __assertionId: string
  title: string
  key?: string
  withData?: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime hook called after transform.
 * The transform extracts serverFn and replaces useAssert with this.
 */
export function __useAssert(
  config: RuntimeAssertConfig,
  deps: React.DependencyList
): void {
  useEffect(() => {
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
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Options for useCheck hook
 */
export interface UseCheckOptions {
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
function getCheckStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined
  // Skip Error, getCheckStack, useCheck
  const lines = stack.split('\n').slice(3)
  return lines.join('\n')
}

/**
 * Parse location from stack trace
 */
function parseCheckLocation(stack: string | undefined): AssertionResult['location'] {
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
 * Report a check assertion result
 */
function reportCheck(
  description: string,
  checkState: WatchState,
  stack: string | undefined,
  context?: Record<string, unknown>
): void {
  if (typeof window === 'undefined' || !window.__scenetest_report) return

  const watch: WatchResult = {
    settled: checkState.settled,
    history: [...checkState.history],
    settledAtRender: checkState.settledAtRender,
  }

  window.__scenetest_report({
    type: 'pass', // check assertions use 'pass' type
    description,
    result: checkState.settled, // true if settled, false if still syncing
    timestamp: Date.now(),
    stack,
    context,
    location: parseCheckLocation(stack),
    watch,
  })
}

/**
 * Watch a condition across renders and track when it settles (becomes true).
 *
 * Similar to `pass()` but tracks the condition over time. Reports an assertion
 * that shows whether the condition eventually became true and how many renders
 * it took to "settle".
 *
 * @example
 * ```tsx
 * function ProfileSync({ userId }: { userId: string }) {
 *   const [localId, setLocalId] = useState('')
 *
 *   // Track that local state syncs with props
 *   useCheck('props and state should be in sync', userId === localId)
 *
 *   useEffect(() => {
 *     setLocalId(userId) // Will sync on next render
 *   }, [userId])
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With context for debugging
 * useCheck('cache matches server', cache.id === serverData.id, {
 *   context: { cache, serverData }
 * })
 * ```
 */
export function useCheck(
  description: string,
  condition: boolean,
  options?: UseCheckOptions
): void {
  // Track state across renders
  const stateRef = useRef<WatchState>({
    history: [],
    settled: false,
    settledAtRender: undefined,
  })

  // Capture stack on first render only
  const stackRef = useRef<string | undefined>(undefined)
  if (stackRef.current === undefined) {
    stackRef.current = getCheckStack()
  }

  // Update history
  stateRef.current.history.push(condition)

  // Check if settled (condition true and wasn't settled before)
  if (condition && !stateRef.current.settled) {
    stateRef.current.settled = true
    stateRef.current.settledAtRender = stateRef.current.history.length
  }

  // Report after each render
  useEffect(() => {
    reportCheck(
      description,
      stateRef.current,
      stackRef.current,
      options?.context
    )
  })

  // Report on unmount if never settled
  useEffect(() => {
    return () => {
      if (!stateRef.current.settled) {
        // Final report showing it never settled
        reportCheck(
          description,
          stateRef.current,
          stackRef.current,
          { ...options?.context, _unmountedWithoutSettling: true }
        )
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
