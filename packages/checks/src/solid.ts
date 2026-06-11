import { createEffect, on, type Accessor } from 'solid-js'

/**
 * A createEffect wrapper for test code that gets stripped in production.
 *
 * Use this to wrap effects containing assertions (should, failed, serverCheck).
 * The entire effect is removed during production builds.
 *
 * @example
 * ```tsx
 * import { createCheck, serverCheck, should } from '@scenetest/checks/solid'
 * import { createSignal } from 'solid-js'
 *
 * function Profile() {
 *   const [profile, setProfile] = createSignal(null)
 *
 *   createCheck(() => {
 *     const p = profile()
 *     if (!p) return
 *
 *     serverCheck(
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
export function createCheck(
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

// Re-export everything from core scenetest for convenience
export { should, failed, serverCheck, match, defineConfig } from './index.js'
export type {
  AssertionResult,
  ScenetestReporter,
  ScenetestConfig,
  AssertServerFn,
  AssertDataFn,
  ServerContext,
  AssertionRpcPayload,
  AssertionRpcResponse,
} from './index.js'
