import { createEffect, on, type Accessor } from 'solid-js'
import type { AssertionConfig } from 'scenetest-js'

/**
 * Solid primitive for multi-context assertions.
 * Takes the same config shape as assert(). Use `enabled: false` to skip.
 *
 * @example
 * ```tsx
 * import { createAssert, pass } from 'scenetest-solid'
 * import { createSignal } from 'solid-js'
 *
 * function Profile() {
 *   const [profile, setProfile] = createSignal(null)
 *
 *   createAssert({
 *     title: 'Email validation',
 *     appData: () => ({ email: profile()?.email }),
 *     assertFn: (server, fromApp) => {
 *       pass('email is valid', server.validateEmail(fromApp.email))
 *     },
 *     enabled: !!profile(),
 *   }, [() => profile()?.email])
 *
 *   return <div>{profile()?.name}</div>
 * }
 * ```
 */
export function createAssert<TAppData>(
  _config: AssertionConfig<TAppData>,
  _deps: Accessor<unknown>[]
): void {
  // This function is transformed by vite-plugin-scenetest
  // If this runs, it means the plugin is not configured or we're in production
  // In production, this will be stripped out
}

/**
 * Internal runtime config passed to __createAssert after transform
 */
export interface RuntimeAssertConfig {
  __assertionId: string
  title: string
  key?: string
  appData: () => unknown
  enabled?: boolean
}

/**
 * Internal runtime primitive called after transform.
 * The transform extracts assertFn and replaces createAssert with this.
 */
export function __createAssert(
  config: RuntimeAssertConfig,
  deps: Accessor<unknown>[]
): void {
  createEffect(
    on(deps, () => {
      // Skip if enabled is explicitly false
      if (config.enabled === false) return

      // Import dynamically to avoid circular deps
      import('scenetest-js/runtime').then(({ __scenetest_rpc }) => {
        __scenetest_rpc({
          id: config.__assertionId,
          title: config.title,
          key: config.key,
          withData: config.appData,
        })
      })
    })
  )
}
