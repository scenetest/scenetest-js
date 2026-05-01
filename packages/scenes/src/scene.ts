import type { TestFn, SceneOptions, RegisteredScene, TestContext, SceneReport } from './types.js'
import { TeamSession } from './team-manager.js'

/**
 * Global registry of scenes.
 * Populated when scene files are imported.
 *
 * Both authoring entry points register here:
 *   - `test()` — await-driven sequential driver (this file)
 *   - `scene()` — reactive queue-building (see `reactive.ts`)
 *
 * The reactive `scene()` wraps its user fn into an async function so that
 * the runner sees a uniform `TestFn` shape regardless of authoring model.
 */
export const sceneRegistry: RegisteredScene[] = []

/**
 * Current file being loaded (set by the runner before importing)
 */
let currentFile = ''

/**
 * Set the current file being loaded
 */
export function setCurrentFile(file: string): void {
  currentFile = file
}

/**
 * Internal registration helper used by both `test()` and the reactive `scene()`.
 *
 * Not part of the public API — authors should use `test()` or `scene()`.
 */
export function registerScene(name: string, fn: TestFn, options?: SceneOptions): void {
  sceneRegistry.push({
    name,
    fn,
    file: currentFile,
    ...(options?.roles ? { roles: options.roles } : {}),
  })
}

/**
 * Define an await-driven test (Playwright-style sequential orchestration).
 *
 * Each DSL call is awaited in order — the mental model is "first this, then
 * that."  Use this when you want explicit, linear control flow.  For the
 * reactive queue-building model (scenetest's unique approach), use `scene()`
 * from `./reactive.ts`.
 *
 * @example
 * ```ts
 * import { test } from '@scenetest/scenes'
 *
 * test('user updates their profile', async ({ actor }) => {
 *   const user = await actor('primary-user')
 *   await user.openTo('/settings/profile')
 *   await user.see('profile-form')
 * })
 *
 * // With roles for team matching:
 * test('admin promotes user', { roles: ['admin', 'user'] }, async ({ actor }) => {
 *   const admin = await actor('admin')
 *   const user = await actor('user')
 * })
 * ```
 */
export function test(name: string, fn: TestFn): void
export function test(name: string, options: SceneOptions, fn: TestFn): void
export function test(name: string, fnOrOptions: TestFn | SceneOptions, maybeFn?: TestFn): void {
  const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn!
  const options = typeof fnOrOptions === 'function' ? undefined : fnOrOptions
  registerScene(name, fn, options)
}

/**
 * Current session for scene execution
 */
let currentSession: TeamSession | null = null

/**
 * Set the current session for scene execution
 */
export function setCurrentSession(session: TeamSession | null): void {
  currentSession = session
}

/**
 * Get the current session. Used by `scene()` (reactive) to access session
 * internals during execution.
 */
export function getCurrentSession(): TeamSession | null {
  return currentSession
}

/**
 * Run a single scene with the given session
 */
export async function runScene(
  registered: RegisteredScene,
  session: TeamSession,
  timeout: number
): Promise<SceneReport> {
  const start = Date.now()

  // Create scene context
  const context: TestContext = {
    actor: async (role: string) => {
      return session.getActor(role)
    },
    teamIndex: session.teamIndex,
    team: session.meta,
  }

  // Set current session for reactive scene() calls
  setCurrentSession(session)

  let status: SceneReport['status'] = 'completed'
  let error: string | undefined

  try {
    // Run with timeout
    await Promise.race([
      registered.fn(context),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Scene timeout after ${timeout}ms`)), timeout)
      ),
    ])
  } catch (err) {
    if (err instanceof Error && err.message.includes('timeout')) {
      status = 'timeout'
    } else {
      status = 'failed'
    }
    error = err instanceof Error ? err.message : String(err)
  } finally {
    // Final sweep for error toasts / error elements that may have appeared
    // at the moment an action failed but slipped past per-action polling.
    // Runs whether the scene completed or threw, before the report is built.
    await session.flushErrorSelectors()
    setCurrentSession(null)
  }

  // Build actor map for report
  const actors: Record<string, { key: string; username?: string }> = {}
  for (const [role, actor] of session.getActors()) {
    actors[role] = {
      key: actor.key,
      username: actor.username,
    }
  }

  return {
    name: registered.name,
    file: registered.file,
    status,
    teamIndex: session.teamIndex,
    team: session.meta,
    actors,
    assertions: session.assertions,
    warnings: session.warnings,
    consoleErrors: session.consoleErrors,
    timeline: session.timeline,
    duration: Date.now() - start,
    error,
  }
}
