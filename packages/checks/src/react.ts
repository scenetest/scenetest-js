import { useEffect } from 'react'

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
