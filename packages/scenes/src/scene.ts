import type { SceneFn, RegisteredScene, SceneContext, SceneReport } from './types.js'
import { TeamSession } from './team-manager.js'

/**
 * Global registry of scenes.
 * Populated when scene files are imported.
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
 * Define a scene spec.
 *
 * @example
 * ```ts
 * import { scene } from '@scenecheck/scenes'
 *
 * scene('user updates their profile', async ({ actor }) => {
 *   const user = await actor('primary-user')
 *   await user.openTo('/settings/profile')
 *   await user.see('profile-form')
 * })
 * ```
 */
export function scene(name: string, fn: SceneFn): void {
  sceneRegistry.push({
    name,
    fn,
    file: currentFile,
  })
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
 * Get the current session. Used by flow() to access session internals
 * during reactive scene execution.
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
  const context: SceneContext = {
    actor: async (role: string) => {
      return session.getActor(role)
    },
    teamIndex: session.teamIndex,
  }

  // Set current session for flow() access
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
    setCurrentSession(null)
  }

  // Build actor map for report
  const actors: Record<string, { id: string; username?: string }> = {}
  for (const [role, actor] of session.getActors()) {
    actors[role] = {
      id: actor.id,
      username: actor.username,
    }
  }

  return {
    name: registered.name,
    file: registered.file,
    status,
    teamIndex: session.teamIndex,
    actors,
    assertions: session.assertions,
    warnings: session.warnings,
    timeline: session.timeline,
    duration: Date.now() - start,
    error,
  }
}
