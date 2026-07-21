import { useEffect, useRef } from 'react'
import type { AssertionResult } from './types.js'
import {
  createConverger,
  type ConvergeCheck,
  type ConvergeOptions,
  type Converger,
} from './converge.js'
import { isValidFilePath } from './assertions.js'

/**
 * A useEffect wrapper for test code that gets stripped in production.
 *
 * Use this to wrap effects containing assertions (should, failed, serverCheck).
 * The entire effect is removed during production builds.
 *
 * @example
 * ```tsx
 * import { useCheck, serverCheck, should } from '@scenetest/checks/react'
 *
 * useCheck(() => {
 *   serverCheck(
 *     'profile synced to db',
 *     async (server, data) => {
 *       const dbUser = await server.getUser(data.id)
 *       should('name matches', data.name === dbUser.name)
 *     },
 *     () => ({ id: profile.id, name: profile.name })
 *   )
 * }, [profile])
 * ```
 */
export function useCheck(
  effect: React.EffectCallback,
  deps?: React.DependencyList
): void {
  // In dev mode, this just runs useEffect
  // In production, vite-plugin-scenetest strips the entire call
  useEffect(effect, deps)
}

/**
 * Assert that a `[client, target]` pair converges within a bounded window.
 *
 * Designed for local-first UIs where a locally-mutated value updates the DOM
 * before a derived / server-mirrored value catches up — the check tolerates
 * the gap while it exists, and fails only if it persists past `timeout`.
 *
 * @example
 * ```tsx
 * // Pair form — the common case. Auto-restarts when `cartTotal` changes.
 * useConverge('cart total reflects last item added', [cartTotal, derivedTotal], {
 *   timeout: 2000,
 * })
 *
 * // Predicate form — pairs with match() for multi-field checks.
 * useConverge(
 *   'all deck fields sync',
 *   () => match([local.cards, mirror.cards], [local.updated_at, mirror.updated_at]),
 *   { timeout: 2000 }
 * )
 * ```
 *
 * On timeout, the failed assertion's `context` carries `{ client, target,
 * timeoutMs, elapsedMs }` so the panel tooltip shows what didn't line up.
 * On success, it carries `{ convergedInMs }`.
 *
 * The hook re-reads the current values on every render and stashes them in a
 * ref, so the timeout callback always sees the latest values — you don't need
 * an explicit deps array. If the natural reset trigger isn't `pair[0]`, pass
 * `options.resetKey` instead.
 */
export function useConverge<A, B>(
  title: string,
  check: readonly [A, B] | (() => boolean),
  options?: ConvergeOptions
): void {
  const metaRef = useRef<{ stack?: string; location?: AssertionResult['location'] } | null>(null)
  if (metaRef.current === null) {
    const stack = captureStack()
    metaRef.current = { stack, location: parseLocation(stack) }
  }

  const convergerRef = useRef<Converger | null>(null)
  if (convergerRef.current === null) {
    convergerRef.current = createConverger(title, options ?? {}, metaRef.current, {
      now: () => Date.now(),
      setTimeout: (fn, ms) => (globalThis.setTimeout as typeof setTimeout)(fn, ms),
      clearTimeout: (h) => (globalThis.clearTimeout as typeof clearTimeout)(h as ReturnType<typeof setTimeout>),
      report: (r) => {
        if (typeof window !== 'undefined' && window.__scenetest_report) {
          window.__scenetest_report(r)
        }
      },
    })
  }

  const resetKey = options?.resetKey

  useEffect(() => {
    convergerRef.current!.observe(check as ConvergeCheck, { resetKey })
  })

  useEffect(() => {
    return () => {
      convergerRef.current?.dispose()
    }
  }, [])
}

function captureStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined
  // Skip Error, captureStack, useConverge frames.
  return stack.split('\n').slice(3).join('\n')
}

function parseLocation(stack: string | undefined): AssertionResult['location'] {
  if (!stack) return undefined
  const m = stack.match(/(?:at\s+)?(?:\S+\s+\()?(?:https?:\/\/[^/]+)?([^:)]+):(\d+)(?::(\d+))?/)
  if (!m) return undefined
  const file = m[1]
  if (!isValidFilePath(file)) return undefined
  return {
    file,
    line: parseInt(m[2], 10),
    column: m[3] ? parseInt(m[3], 10) : undefined,
  }
}

// Re-export everything from core scenetest for convenience
export { should, failed, serverCheck, match, defineConfig } from './index.js'
export type {
  AssertionResult,
  ScenetestReporter,
  ScenetestConfig,
  AssertServerFn,
  AssertDataFn,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from './index.js'
