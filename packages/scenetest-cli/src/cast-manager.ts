import type { Browser, BrowserContext, Page } from 'playwright'
import type { CastConfig, ActorConfig, AssertionResult, TimelineEntry } from './types.js'
import { ActorHandleImpl } from './actor.js'
import { MessageBus } from './message-bus.js'

/**
 * Manages cast assignment and lifecycle.
 *
 * Each scene gets exclusive use of one cast.
 * The cast manager tracks which casts are in use.
 */
export class CastManager {
  private casts: CastConfig[]
  private inUse = new Set<number>()
  private browser: Browser | null = null

  constructor(casts: CastConfig[]) {
    this.casts = casts
  }

  /**
   * Set the browser instance to use for creating contexts
   */
  setBrowser(browser: Browser): void {
    this.browser = browser
  }

  /**
   * Get the number of available casts
   */
  get availableCount(): number {
    return this.casts.length - this.inUse.size
  }

  /**
   * Get the total number of casts
   */
  get totalCount(): number {
    return this.casts.length
  }

  /**
   * Acquire an available cast for exclusive use.
   * Returns the cast index, or null if none available.
   */
  acquire(): number | null {
    for (let i = 0; i < this.casts.length; i++) {
      if (!this.inUse.has(i)) {
        this.inUse.add(i)
        return i
      }
    }
    return null
  }

  /**
   * Wait for a cast to become available.
   */
  async acquireWait(timeout = 60000): Promise<number> {
    const start = Date.now()

    while (true) {
      const index = this.acquire()
      if (index !== null) {
        return index
      }

      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for available cast (${timeout}ms)`)
      }

      // Wait a bit before trying again
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /**
   * Release a cast back to the pool
   */
  release(castIndex: number): void {
    this.inUse.delete(castIndex)
  }

  /**
   * Get the cast config for a given index
   */
  getCast(castIndex: number): CastConfig {
    if (castIndex < 0 || castIndex >= this.casts.length) {
      throw new Error(`Invalid cast index: ${castIndex}`)
    }
    return this.casts[castIndex]
  }

  /**
   * Get actor config for a role in a cast
   */
  getActorConfig(castIndex: number, role: string): ActorConfig {
    const cast = this.getCast(castIndex)
    const actor = cast[role]
    if (!actor) {
      throw new Error(`Role "${role}" not found in cast ${castIndex}. Available roles: ${Object.keys(cast).join(', ')}`)
    }
    return actor
  }

  /**
   * Create a scene session with a cast
   */
  async createSession(
    castIndex: number,
    actionTimeout: number
  ): Promise<CastSession> {
    if (!this.browser) {
      throw new Error('Browser not set. Call setBrowser() first.')
    }
    return new CastSession(
      this.browser,
      this.getCast(castIndex),
      castIndex,
      actionTimeout
    )
  }
}

/**
 * A session for a scene with an assigned cast.
 * Manages browser contexts and actors for the scene.
 */
export class CastSession {
  private contexts = new Map<string, BrowserContext>()
  private actors = new Map<string, ActorHandleImpl>()
  private bus = new MessageBus()
  readonly timeline: TimelineEntry[] = []
  readonly assertions: AssertionResult[] = []

  constructor(
    private browser: Browser,
    private cast: CastConfig,
    readonly castIndex: number,
    private actionTimeout: number
  ) {}

  /**
   * Get or create an actor for a role
   */
  async getActor(role: string): Promise<ActorHandleImpl> {
    // Return existing actor if already created
    const existing = this.actors.get(role)
    if (existing) {
      return existing
    }

    // Get actor config
    const config = this.cast[role]
    if (!config) {
      throw new Error(`Role "${role}" not found in cast. Available roles: ${Object.keys(this.cast).join(', ')}`)
    }

    // Create new browser context for this actor
    const context = await this.browser.newContext()
    const page = await context.newPage()

    // Set up assertion collection
    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      // Add actor info to assertion
      const enriched = { ...result, actor: role }
      this.assertions.push(enriched)
    })

    // Create actor handle
    const actor = new ActorHandleImpl(
      role,
      config,
      page,
      context,
      this.bus,
      this.timeline,
      this.actionTimeout
    )

    this.contexts.set(role, context)
    this.actors.set(role, actor)

    return actor
  }

  /**
   * Get the message bus for this session
   */
  getMessageBus(): MessageBus {
    return this.bus
  }

  /**
   * Get all actors created in this session
   */
  getActors(): Map<string, ActorHandleImpl> {
    return this.actors
  }

  /**
   * Close all browser contexts
   */
  async close(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close()
    }
    this.contexts.clear()
    this.actors.clear()
    this.bus.clear()
  }
}
