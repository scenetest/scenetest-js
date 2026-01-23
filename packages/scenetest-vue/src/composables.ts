import { watchEffect } from 'vue'

/**
 * A watchEffect wrapper for test code that gets stripped in production.
 *
 * Use this to wrap effects containing assertions (should, failed, assert).
 * The entire effect is removed during production builds.
 *
 * @example
 * ```vue
 * <script setup>
 * import { watchTestEffect, assert, should } from '@scenetest/vue'
 * import { ref } from 'vue'
 *
 * const profile = ref(null)
 *
 * watchTestEffect(() => {
 *   if (!profile.value) return
 *
 *   assert(
 *     'profile synced to db',
 *     async (server, data) => {
 *       const dbUser = await server.getUser(data.id)
 *       should('name matches', data.name === dbUser.name)
 *     },
 *     () => ({ id: profile.value.id, name: profile.value.name })
 *   )
 * })
 * </script>
 * ```
 */
export function watchTestEffect(effect: () => void): void {
  // In dev mode, this just runs watchEffect
  // In production, vite-plugin-scenetest strips the entire call
  watchEffect(effect)
}
