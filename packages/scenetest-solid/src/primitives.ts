import { createEffect, on, onCleanup, type Accessor } from 'solid-js'
import type { AssertionConfig, AssertionResult, WatchResult } from 'scenetest'

/**
 * Solid primitive for multi-context assertions.
 * Takes the same config shape as assert(). Use `enabled: false` to skip.
 *
 * @example
 * ```tsx
 * import { createAssert, should } from 'scenetest-solid'
 * import { createSignal } from 'solid-js'
 *
 * function Profile() {
 *   const [profile, setProfile] = createSignal(null)
 *
 *   createAssert({
 *     title: 'Email validation',
 *     withData: () => ({ email: profile()?.email }),
 *     serverFn: (server, data) => {
 *       should('email should be valid', server.validateEmail(data.email))
 *     },
 *     enabled: !!profile(),
 *   }, [() => profile()?.email])
 *
 *   return <div>{profile()?.name}</div>
 * }
 * ```
 */
export function createAssert<TData>(
  _config: AssertionConfig<TData>,
  _deps: Accessor<unknown>[]
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __createAssert after transform
 */
export interface RuntimeAssertConfig {
  __assertionId: string
  title: string
  key?: string
  withData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime primitive called after transform.
 * The transform extracts serverFn and replaces createAssert with this.
 */
export function __createAssert(
  config: RuntimeAssertConfig,
  deps: Accessor<unknown>[]
): void {
  createEffect(
    on(deps, () => {
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
    })
  )
}

/**
 * Options for createCheck primitive
 */
export interface CreateCheckOptions {
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
 * Get stack trace for the check call
 */
function getCheckStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined
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
    location: parseCheckLocation(stack),
    watch,
  })
}

/**
 * Check a reactive condition and track when it settles (becomes true).
 *
 * Similar to `should()` but tracks the condition over time. Reports an assertion
 * that shows whether the condition eventually became true.
 *
 * @example
 * ```tsx
 * import { createCheck } from 'scenetest-solid'
 * import { createSignal, createEffect } from 'solid-js'
 *
 * function ProfileSync(props: { userId: string }) {
 *   const [localId, setLocalId] = createSignal('')
 *
 *   // Track that local state syncs with props
 *   createCheck('props and state should be in sync',
 *     () => props.userId === localId()
 *   )
 *
 *   createEffect(() => {
 *     setLocalId(props.userId)
 *   })
 *
 *   return <div>{localId()}</div>
 * }
 * ```
 */
export function createCheck(
  description: string,
  condition: Accessor<boolean>,
  options?: CreateCheckOptions
): void {
  // Track state across reactive updates
  const state: WatchState = {
    history: [],
    settled: false,
    settledAtRender: undefined,
  }

  // Capture stack on creation
  const stack = getCheckStack()

  createEffect(
    on(condition, (result) => {
      // Update history
      state.history.push(result)

      // Check if settled
      if (result && !state.settled) {
        state.settled = true
        state.settledAtRender = state.history.length
      }

      // Report current state
      reportCheck(description, state, stack, options?.context)
    })
  )

  // Report on cleanup if never settled
  onCleanup(() => {
    if (!state.settled) {
      reportCheck(description, state, stack, {
        ...options?.context,
        _unmountedWithoutSettling: true,
      })
    }
  })
}
