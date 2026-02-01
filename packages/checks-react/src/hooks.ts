import { useEffect } from 'react'

/**
 * A useEffect wrapper for test code that gets stripped in production.
 *
 * Use this to wrap effects containing assertions (should, failed, assert).
 * The entire effect is removed during production builds.
 *
 * @example
 * ```tsx
 * useTestEffect(() => {
 *   assert(
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
export function useTestEffect(
  effect: React.EffectCallback,
  deps?: React.DependencyList
): void {
  // In dev mode, this just runs useEffect
  // In production, vite-plugin-scenetest strips the entire call
  useEffect(effect, deps)
}
