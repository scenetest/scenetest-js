import type { AssertionConfig } from 'scenetest'

/**
 * Svelte helper for multi-context assertions.
 * Use this inside a $effect() block for reactive assertions.
 *
 * @example
 * ```svelte
 * <script>
 * import { runAssert, pass } from 'scenetest-svelte'
 *
 * let profile = $state(null)
 *
 * $effect(() => {
 *   if (!profile) return
 *
 *   runAssert({
 *     title: 'Email validation',
 *     appData: () => ({ email: profile.email }),
 *     assertFn: (server, fromApp) => {
 *       pass('email is valid', server.validateEmail(fromApp.email))
 *     },
 *   })
 * })
 * </script>
 * ```
 *
 * For simple assertions, just use pass() and fail() directly:
 * ```svelte
 * <script>
 * import { pass, fail } from 'scenetest-svelte'
 *
 * let count = $state(0)
 *
 * $effect(() => {
 *   pass('count is non-negative', count >= 0)
 * })
 * </script>
 * ```
 */
export function runAssert<TAppData>(
  _config: AssertionConfig<TAppData>
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __runAssert after transform
 */
export interface RuntimeAssertConfig {
  __assertionId: string
  title: string
  key?: string
  appData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime helper called after transform.
 * The transform extracts assertFn and replaces runAssert with this.
 */
export function __runAssert(config: RuntimeAssertConfig): void {
  // Skip if enabled is explicitly false
  if (config.enabled === false) return

  // Import dynamically to avoid circular deps
  import('scenetest/runtime').then(({ __scenetest_rpc }) => {
    __scenetest_rpc({
      id: config.__assertionId,
      title: config.title,
      key: config.key,
      appData: config.appData,
    })
  })
}
