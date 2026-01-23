import { watchEffect, type WatchSource } from 'vue'
import type { AssertionConfig } from '@scenetest/core'

/**
 * Vue composable for multi-context assertions.
 * Takes the same config shape as assert(). Use `enabled: false` to skip.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAssert } from '@scenetest/vue'
 * import { ref } from 'vue'
 *
 * const profile = ref(null)
 *
 * useAssert({
 *   title: 'Email validation',
 *   withData: () => ({ email: profile.value?.email }),
 *   serverFn: (server, data) => {
 *     should('email should be valid', server.validateEmail(data.email))
 *   },
 *   enabled: !!profile.value,
 * }, [() => profile.value?.email])
 * </script>
 * ```
 */
export function useAssert<TData>(
  _config: AssertionConfig<TData>,
  _deps: WatchSource[]
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
  withData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime composable called after transform.
 * The transform extracts serverFn and replaces useAssert with this.
 */
export function __useAssert(
  config: RuntimeAssertConfig,
  deps: WatchSource[]
): void {
  watchEffect(() => {
    // Touch deps to establish reactivity
    deps.forEach(dep => {
      if (typeof dep === 'function') dep()
    })

    // Skip if enabled is explicitly false
    if (config.enabled === false) return

    // Import dynamically to avoid circular deps
    import('@scenetest/core/runtime').then(({ __scenetest_rpc }) => {
      __scenetest_rpc({
        id: config.__assertionId,
        title: config.title,
        key: config.key,
        withData: config.withData,
      })
    })
  })
}
