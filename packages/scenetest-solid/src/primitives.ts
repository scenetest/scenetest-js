import { createEffect, on, type Accessor } from 'solid-js'

/**
 * A createEffect wrapper for test code that gets stripped in production.
 *
 * Use this to wrap effects containing assertions (should, failed, assert).
 * The entire effect is removed during production builds.
 *
 * @example
 * ```tsx
 * import { createTestEffect, assert, should } from '@scenetest/solid'
 * import { createSignal } from 'solid-js'
 *
 * function Profile() {
 *   const [profile, setProfile] = createSignal(null)
 *
 *   createTestEffect(() => {
 *     const p = profile()
 *     if (!p) return
 *
 *     assert(
 *       'profile synced to db',
 *       async (server, data) => {
 *         const dbUser = await server.getUser(data.id)
 *         should('name matches', data.name === dbUser.name)
 *       },
 *       () => ({ id: p.id, name: p.name })
 *     )
 *   })
 *
 *   return <div>{profile()?.name}</div>
 * }
 * ```
 */
export function createTestEffect(
  effect: () => void,
  deps?: Accessor<unknown>[]
): void {
  // In dev mode, this just runs createEffect
  // In production, vite-plugin-scenetest strips the entire call
  if (deps) {
    createEffect(on(deps, effect))
  } else {
    createEffect(effect)
  }
}
