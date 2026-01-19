import { useEffect } from 'react'
import type { AssertionConfig } from './types.js'

/**
 * React hook for multi-context assertions.
 * Takes the same config shape as assert(). Use `enabled: false` to skip.
 *
 * @example
 * ```tsx
 * useAssert({
 *   title: 'Email validation',
 *   appData: () => ({ email: profile.email }),
 *   assertFn: (server, fromApp) => {
 *     pass('email is valid', server.validateEmail(fromApp.email))
 *   },
 *   enabled: !isLoading,
 * }, [isLoading, profile?.email])
 * ```
 */
export function useAssert<TAppData>(
  _config: AssertionConfig<TAppData>,
  _deps: React.DependencyList
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
  appData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime hook called after transform.
 * The transform extracts assertFn and replaces useAssert with this.
 */
export function __useAssert(
  config: RuntimeAssertConfig,
  deps: React.DependencyList
): void {
  useEffect(() => {
    // Skip if enabled is explicitly false
    if (config.enabled === false) return

    // Import dynamically to avoid circular deps
    import('./runtime.js').then(({ __scenetest_rpc }) => {
      __scenetest_rpc({
        id: config.__assertionId,
        title: config.title,
        key: config.key,
        appData: config.appData,
      })
    })
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
