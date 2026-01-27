import type { Browser, BrowserContext, Page } from 'playwright'
import type { TeamConfig, ActorConfig, AssertionResult, TimelineEntry, ScriptWarning } from './types.js'
import { ActorHandleImpl } from './actor.js'
import { MessageBus } from './message-bus.js'

/**
 * Manages team assignment and lifecycle.
 *
 * Each scene gets exclusive use of one team.
 * The team manager tracks which teams are in use.
 */
export class TeamManager {
  private teams: TeamConfig[]
  private inUse = new Set<number>()
  private browser: Browser | null = null

  constructor(teams: TeamConfig[]) {
    this.teams = teams
  }

  /**
   * Set the browser instance to use for creating contexts
   */
  setBrowser(browser: Browser): void {
    this.browser = browser
  }

  /**
   * Get the number of available teams
   */
  get availableCount(): number {
    return this.teams.length - this.inUse.size
  }

  /**
   * Get the total number of teams
   */
  get totalCount(): number {
    return this.teams.length
  }

  /**
   * Acquire an available team for exclusive use.
   * Returns the team index, or null if none available.
   */
  acquire(): number | null {
    for (let i = 0; i < this.teams.length; i++) {
      if (!this.inUse.has(i)) {
        this.inUse.add(i)
        return i
      }
    }
    return null
  }

  /**
   * Wait for a team to become available.
   */
  async acquireWait(timeout = 60000): Promise<number> {
    const start = Date.now()

    while (true) {
      const index = this.acquire()
      if (index !== null) {
        return index
      }

      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for available team (${timeout}ms)`)
      }

      // Wait a bit before trying again
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /**
   * Release a team back to the pool
   */
  release(teamIndex: number): void {
    this.inUse.delete(teamIndex)
  }

  /**
   * Get the team config for a given index
   */
  getTeam(teamIndex: number): TeamConfig {
    if (teamIndex < 0 || teamIndex >= this.teams.length) {
      throw new Error(`Invalid team index: ${teamIndex}`)
    }
    return this.teams[teamIndex]
  }

  /**
   * Get actor config for a role in a team
   */
  getActorConfig(teamIndex: number, role: string): ActorConfig {
    const team = this.getTeam(teamIndex)
    const actor = team[role]
    if (!actor) {
      throw new Error(`Role "${role}" not found in team ${teamIndex}. Available roles: ${Object.keys(team).join(', ')}`)
    }
    return actor
  }

  /**
   * Create a scene session with a team
   */
  async createSession(
    teamIndex: number,
    actionTimeout: number,
    warnAfter: number,
    baseUrl?: string
  ): Promise<TeamSession> {
    if (!this.browser) {
      throw new Error('Browser not set. Call setBrowser() first.')
    }
    return new TeamSession(
      this.browser,
      this.getTeam(teamIndex),
      teamIndex,
      actionTimeout,
      warnAfter,
      baseUrl
    )
  }
}

/**
 * A session for a scene with an assigned team.
 * Manages browser contexts and actors for the scene.
 */
export class TeamSession {
  private contexts = new Map<string, BrowserContext>()
  private actors = new Map<string, ActorHandleImpl>()
  private bus = new MessageBus()
  readonly timeline: TimelineEntry[] = []
  readonly assertions: AssertionResult[] = []
  readonly warnings: ScriptWarning[] = []

  constructor(
    private browser: Browser,
    private team: TeamConfig,
    readonly teamIndex: number,
    readonly actionTimeout: number,
    readonly warnAfter: number,
    private baseUrl?: string
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
    const config = this.team[role]
    if (!config) {
      throw new Error(`Role "${role}" not found in team. Available roles: ${Object.keys(this.team).join(', ')}`)
    }

    // Create new browser context for this actor
    const context = await this.browser.newContext({
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    })
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
      this.warnings,
      this.actionTimeout,
      this.warnAfter
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
