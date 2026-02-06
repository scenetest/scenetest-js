import type { Browser, BrowserContext, Page } from 'playwright'
import type { TeamConfig, ActorConfig, AssertionResult, TimelineEntry, ScriptWarning, ResolvedTeam, TeamMeta } from './types.js'
import type { DeviceProfile } from './devices.js'
import { DeviceRotation } from './devices.js'
import { SequentialActorHandleImpl } from './actor.js'
import { MessageBus } from './message-bus.js'

/**
 * Manages team assignment and lifecycle.
 *
 * Each scene gets exclusive use of one team.
 * The team manager tracks which teams are in use.
 */
export class TeamManager {
  private teams: ResolvedTeam[]
  private inUse = new Set<number>()
  private browser: Browser | null = null
  private deviceRotation: DeviceRotation | null = null

  constructor(teams: ResolvedTeam[]) {
    this.teams = teams
  }

  /**
   * Set the browser instance to use for creating contexts
   */
  setBrowser(browser: Browser): void {
    this.browser = browser
  }

  /**
   * Enable device rotation with the given profiles (or built-in defaults).
   */
  setDeviceRotation(rotation: DeviceRotation): void {
    this.deviceRotation = rotation
  }

  /**
   * Get the current device rotation instance, if any.
   */
  getDeviceRotation(): DeviceRotation | null {
    return this.deviceRotation
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
   * Get the resolved team for a given index
   */
  getTeam(teamIndex: number): ResolvedTeam {
    if (teamIndex < 0 || teamIndex >= this.teams.length) {
      throw new Error(`Invalid team index: ${teamIndex}`)
    }
    return this.teams[teamIndex]
  }

  /**
   * Get team metadata for a given index
   */
  getTeamMeta(teamIndex: number): TeamMeta {
    return this.getTeam(teamIndex).meta
  }

  /**
   * Get actor config for a role in a team
   */
  getActorConfig(teamIndex: number, role: string): ActorConfig {
    const team = this.getTeam(teamIndex)
    const actor = team.actors[role]
    if (!actor) {
      throw new Error(`Role "${role}" not found in team ${teamIndex}. Available roles: ${Object.keys(team.actors).join(', ')}`)
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
    const resolved = this.getTeam(teamIndex)
    return new TeamSession(
      this.browser,
      resolved.actors,
      resolved.meta,
      teamIndex,
      actionTimeout,
      warnAfter,
      baseUrl,
      this.deviceRotation
    )
  }
}

/**
 * A session for a scene with an assigned team.
 * Manages browser contexts and actors for the scene.
 */
export class TeamSession {
  private contexts = new Map<string, BrowserContext>()
  private actors = new Map<string, SequentialActorHandleImpl>()
  private actorDevices = new Map<string, DeviceProfile>()
  private bus = new MessageBus()
  readonly timeline: TimelineEntry[] = []
  readonly assertions: AssertionResult[] = []
  readonly warnings: ScriptWarning[] = []

  /** Team metadata (name, tags) */
  readonly meta: TeamMeta

  constructor(
    private browser: Browser,
    private team: TeamConfig,
    meta: TeamMeta,
    readonly teamIndex: number,
    readonly actionTimeout: number,
    readonly warnAfter: number,
    private baseUrl?: string,
    private deviceRotation?: DeviceRotation | null
  ) {
    this.meta = meta
  }

  /**
   * Get the actor config for a role (sync — no browser setup).
   * Used by flow() to create reactive handles before browser init.
   */
  getActorConfig(role: string): ActorConfig {
    const config = this.team[role]
    if (!config) {
      throw new Error(`Role "${role}" not found in team. Available roles: ${Object.keys(this.team).join(', ')}`)
    }
    return config
  }

  /**
   * Create a browser context + page for a role and wire up assertion collection.
   * Returns the Page. Used by flow() to initialize actors after declaration.
   */
  async createPage(role: string): Promise<Page> {
    const config = this.team[role]
    if (!config) {
      throw new Error(`Role "${role}" not found in team. Available roles: ${Object.keys(this.team).join(', ')}`)
    }

    // Determine device for this actor (if rotation is enabled)
    const device = this.deviceRotation?.next() ?? null
    if (device) {
      this.actorDevices.set(role, device)
    }

    // Create context with device emulation if assigned
    const contextOptions = {
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
      ...(device ? device.contextOptions : {}),
    }
    const context = await this.browser.newContext(contextOptions)
    const page = await context.newPage()

    // Track device name for assertions
    const deviceName = device?.name

    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      const enriched = { ...result, actor: role, ...(deviceName ? { device: deviceName } : {}) }
      this.assertions.push(enriched)
    })

    this.contexts.set(role, context)

    // Log device assignment
    if (device) {
      console.log(`    [${role}] assigned device: ${device.name} (${device.category})`)
    }

    return page
  }

  /**
   * Get or create an actor for a role
   */
  async getActor(role: string): Promise<SequentialActorHandleImpl> {
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

    // Determine device for this actor (if rotation is enabled)
    const device = this.deviceRotation?.next() ?? null
    if (device) {
      this.actorDevices.set(role, device)
    }

    // Create new browser context for this actor, with device emulation if assigned
    const contextOptions = {
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
      ...(device ? device.contextOptions : {}),
    }
    const context = await this.browser.newContext(contextOptions)
    const page = await context.newPage()

    // Track device name for assertions
    const deviceName = device?.name

    // Set up assertion collection
    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      // Add actor and device info to assertion
      const enriched = { ...result, actor: role, ...(deviceName ? { device: deviceName } : {}) }
      this.assertions.push(enriched)
    })

    // Create actor handle
    const actor = new SequentialActorHandleImpl(
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

    // Log device assignment
    if (device) {
      console.log(`    [${role}] assigned device: ${device.name} (${device.category})`)
    }

    return actor
  }

  /**
   * Get the device assigned to an actor role
   */
  getActorDevice(role: string): DeviceProfile | undefined {
    return this.actorDevices.get(role)
  }

  /**
   * Get all actor-device assignments
   */
  getActorDevices(): Map<string, DeviceProfile> {
    return this.actorDevices
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
  getActors(): Map<string, SequentialActorHandleImpl> {
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
    this.actorDevices.clear()
    this.bus.clear()
  }
}
