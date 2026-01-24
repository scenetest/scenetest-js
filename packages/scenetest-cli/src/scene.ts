import type { SceneFn, RegisteredScene, SceneContext, SceneReport, SceneEvent, ActorHandle } from './types.js'
import { CastSession } from './cast-manager.js'
import { when as whenImpl } from './message-bus.js'

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
 * import { scene } from '@scenetest/cli'
 *
 * scene('user updates their profile', async ({ cast }) => {
 *   const user = await cast('primary_user_1')
 *   await user.goto('/settings/profile')
 *   await user.seeId('profile-form')
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
 * Current session for when() calls
 */
let currentSession: CastSession | null = null

/**
 * Set the current session for when() calls
 */
export function setCurrentSession(session: CastSession | null): void {
  currentSession = session
}

/**
 * Coordinate between actors using the message bus.
 *
 * @example
 * ```ts
 * // When message is received, execute action
 * when('user2 accepts', () => user1.seeId('notification'))
 *
 * // When action completes, emit message
 * when(() => user2.seeId('toast'), 'user2 accepts')
 * ```
 */
export function when(
  trigger: string | (() => Promise<void>),
  action: string | (() => Promise<void>)
): void {
  if (!currentSession) {
    throw new Error('when() can only be called inside a scene')
  }
  whenImpl(currentSession.getMessageBus(), trigger, action)
}

/**
 * Emit a narrative event for an actor.
 * Alternative to actor.happens() for more natural syntax.
 *
 * @example
 * ```ts
 * // These are equivalent:
 * await happens(user1, 'goes into the elevator')
 * await user1.happens('goes into the elevator')
 *
 * // With data payload:
 * await happens(friend3, 'phone battery dies', { level: 5 })
 * ```
 */
export function happens(actor: ActorHandle, description: string, data?: unknown): PromiseLike<void> {
  return actor.happens(description, data)
}

/**
 * Wait for an event matching a predicate or event name pattern.
 *
 * @example
 * ```ts
 * // Wait for specific event by name
 * await waitForEvent('user-1 goes into the elevator')
 *
 * // Wait for any event from an actor
 * await waitForEvent(e => e.actor === 'user-1')
 *
 * // Wait for event with specific data
 * await waitForEvent(e =>
 *   e.name.includes('phone battery') &&
 *   e.data?.level < 10
 * )
 * ```
 */
export function waitForEvent(
  predicateOrName: string | ((e: SceneEvent) => boolean),
  timeout?: number
): Promise<SceneEvent> {
  if (!currentSession) {
    throw new Error('waitForEvent() can only be called inside a scene')
  }

  const predicate =
    typeof predicateOrName === 'string' ? (e: SceneEvent) => e.name === predicateOrName : predicateOrName

  return currentSession.getMessageBus().waitForEvent(predicate, timeout)
}

/**
 * Get all events that have been emitted in the current scene.
 *
 * @example
 * ```ts
 * const events = getEvents()
 * console.log(events.filter(e => e.actor === 'user-1'))
 * ```
 */
export function getEvents(): readonly SceneEvent[] {
  if (!currentSession) {
    throw new Error('getEvents() can only be called inside a scene')
  }
  return currentSession.getMessageBus().getEvents()
}

/**
 * Run a single scene with the given session
 */
export async function runScene(
  registered: RegisteredScene,
  session: CastSession,
  timeout: number
): Promise<SceneReport> {
  const start = Date.now()

  // Create scene context
  const context: SceneContext = {
    cast: async (role: string) => {
      return session.getActor(role)
    },
    castIndex: session.castIndex,
  }

  // Set current session for when() calls
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
    castIndex: session.castIndex,
    actors,
    assertions: session.assertions,
    timeline: session.timeline,
    duration: Date.now() - start,
    error,
  }
}
