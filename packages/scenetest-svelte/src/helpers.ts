/**
 * A marker function for test code that gets stripped in production.
 *
 * Use this inside a $effect() to wrap assertions. The entire call is removed
 * during production builds.
 *
 * @example
 * ```svelte
 * <script>
 * import { testEffect, assert, should } from '@scenetest/svelte'
 *
 * let profile = $state(null)
 *
 * $effect(() => {
 *   testEffect(() => {
 *     if (!profile) return
 *
 *     assert(
 *       'profile synced to db',
 *       async (server, data) => {
 *         const dbUser = await server.getUser(data.id)
 *         should('name matches', data.name === dbUser.name)
 *       },
 *       () => ({ id: profile.id, name: profile.name })
 *     )
 *   })
 * })
 * </script>
 * ```
 *
 * For simple cases, you can use assert() directly in $effect:
 * ```svelte
 * <script>
 * import { should } from '@scenetest/svelte'
 *
 * let count = $state(0)
 *
 * $effect(() => {
 *   should('count should be non-negative', count >= 0)
 * })
 * </script>
 * ```
 */
export function testEffect(effect: () => void): void {
  // In dev mode, this just runs the effect immediately
  // In production, vite-plugin-scenetest strips the entire call
  effect()
}
