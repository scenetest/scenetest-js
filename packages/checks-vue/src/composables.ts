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
 * import { watchCheck, assert, should } from '@scenecheck/checks-vue'
 * import { ref } from 'vue'
 *
 * const profile = ref(null)
 *
 * watchCheck(() => {
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
export function watchCheck(effect: () => void): void {
  // In dev mode, this just runs watchEffect
  // In production, vite-plugin-scenecheck strips the entire call
  watchEffect(effect)
}
