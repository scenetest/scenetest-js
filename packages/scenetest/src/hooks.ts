import { useEffect } from 'react'
import type { AssertionConfig } from './types.js'
import { pass as passAssertion, fail as failAssertion } from './assertions.js'

/**
 * React hook for simple browser-side pass assertions.
 * Returns [description, condition] or undefined/null to skip.
 *
 * @example
 * ```tsx
 * usePassEffect(() => {
 *   if (isLoading) return undefined
 *   return ['user is loaded', user !== null]
 * }, [user, isLoading])
 * ```
 */
export function usePassEffect(
  factory: () => [string, boolean, Record<string, unknown>?] | null | undefined,
  deps: React.DependencyList
): void {
  useEffect(() => {
    const result = factory()
    if (result == null) return
    const [description, condition, context] = result
    passAssertion(description, condition, context)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * React hook for simple browser-side fail assertions.
 * Returns [description, condition] or undefined/null to skip.
 *
 * @example
 * ```tsx
 * useFailEffect(() => {
 *   if (isLoading) return undefined
 *   return ['user should not be in error state', user?.error]
 * }, [user, isLoading])
 * ```
 */
export function useFailEffect(
  factory: () => [string, boolean, Record<string, unknown>?] | null | undefined,
  deps: React.DependencyList
): void {
  useEffect(() => {
    const result = factory()
    if (result == null) return
    const [description, condition, context] = result
    failAssertion(description, condition, context)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * React hook for running multi-context assertions when dependencies change.
 *
 * This is the user-facing API. It gets transformed by vite-plugin-scenetest
 * to extract the assertFn and replace with __useAssertEffect.
 *
 * @example
 * ```tsx
 * useAssertEffect(() => {
 *   if (isLoading) return undefined // skip when loading
 *   return {
 *     title: 'Email validation on server',
 *     appData: () => ({ email: profile.email }),
 *     assertFn: (server, fromApp) => {
 *       pass('email is valid', server.validateEmail(fromApp.email))
 *     },
 *   }
 * }, [profile?.email])
 * ```
 */
export function useAssertEffect<TAppData>(
  _factory: () => AssertionConfig<TAppData> | null | undefined,
  _deps: React.DependencyList
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * React hook for multi-context assertions with a cleaner API.
 * The assertFn runs on the server with access to server.* functions.
 * Pass undefined for appData to skip the assertion.
 *
 * @example
 * ```tsx
 * useServerAssert(async (server, fromApp) => {
 *   const dbProfile = await server.db.get(fromApp.userId)
 *   pass('DB matches local', dbProfile.name === fromApp.local.name)
 * }, isLoading ? undefined : { local: collection.get(id), state: profile }, [isLoading, profile?.id])
 * ```
 */
export function useServerAssert<TAppData>(
  _assertFn: (server: import('./types.js').ServerContext, appData: TAppData) => void | Promise<void>,
  _appData: TAppData | undefined,
  _deps: React.DependencyList
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __useAssertEffect after transform
 */
export interface RuntimeAssertionConfig {
  __assertionId: string
  title: string
  key?: string
  appData: () => unknown
}

/**
 * Internal runtime config passed to __useServerAssert after transform
 */
export interface RuntimeServerAssertConfig {
  __assertionId: string
  appData: unknown
}

/**
 * Internal runtime hook called after transform.
 * The transform extracts assertFn and replaces useAssertEffect with this.
 */
export function __useAssertEffect(
  factory: () => RuntimeAssertionConfig | null | undefined,
  deps: React.DependencyList
): void {
  useEffect(() => {
    const config = factory()
    if (config == null) return // null or undefined skips

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

/**
 * Internal runtime hook called after transform.
 * The transform extracts assertFn and replaces useServerAssert with this.
 */
export function __useServerAssert(
  config: RuntimeServerAssertConfig | undefined,
  deps: React.DependencyList
): void {
  useEffect(() => {
    if (config == null) return // undefined skips

    // Import dynamically to avoid circular deps
    import('./runtime.js').then(({ __scenetest_rpc }) => {
      __scenetest_rpc({
        id: config.__assertionId,
        title: 'server assertion', // auto-generated title
        appData: () => config.appData,
      })
    })
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
