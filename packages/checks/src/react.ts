import { useEffect, useRef } from 'react'
import type { AssertionResult } from './types.js'
import {
  createConverger,
  type ConvergeOptions,
  type ConvergePair,
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
 * Assert that one or more `[client, target]` pairs converge within a bounded
 * window — think of it as `match()` with a tolerance for local-first UIs
 * where a locally-mutated value updates the DOM before its derived / mirrored
 * counterpart catches up.
 *
 * @example
 * ```tsx
 * // Single pair.
 * useConverge('cart total propagates', [[cartTotal, derivedTotal]], {
 *   timeout: 2000,
 * })
 *
 * // Multiple pairs. All must line up for a pass.
 * useConverge(
 *   'all deck fields sync',
 *   [
 *     [local.cards, mirror.cards],
 *     [local.updated_at, mirror.updated_at],
 *   ],
 *   { timeout: 2000 }
 * )
 * ```
 *
 * On timeout, the failed assertion's `context` carries the last-seen values —
 * `{ client, target, timeoutMs, elapsedMs }` for the single-pair case, or
 * `{ mismatches: [{ index, client, target }], timeoutMs, elapsedMs }` for
 * multi-pair. On success it carries `{ convergedInMs }`.
 *
 * The hook re-reads the current values on every render and stashes them in a
 * ref, so the timeout callback always sees the latest values — no deps array
 * needed. A new window opens automatically whenever any client value
 * (`pair[i][0]`) changes; override with `options.resetKey` if the natural
 * reset trigger is something else.
 */
export function useConverge(
  title: string,
  pairs: readonly ConvergePair[],
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
    convergerRef.current!.observe(pairs, { resetKey })
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
