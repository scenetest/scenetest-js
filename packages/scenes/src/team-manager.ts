import type { Browser, BrowserContext, Page } from 'playwright'
import type { TeamConfig, ActorConfig, AssertionResult, TimelineEntry, ScriptWarning, ConsoleError, ResolvedTeam, TeamMeta, PageFactory } from './types.js'
import type { DeviceProfile } from './devices.js'
import type { StorageState } from './warmup.js'
import { WarmupCache } from './warmup.js'
import type { NavigationMode } from './keyboard.js'
import { NavigationModeRotation } from './keyboard.js'
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
  private warmupCache = new WarmupCache()
  private navigationModeRotation: NavigationModeRotation | null = null

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
   * Get all resolved teams.
   */
  getTeams(): ResolvedTeam[] {
    return this.teams
  }

  /**
   * Enable keyboard navigation mode rotation.
   */
  setNavigationModeRotation(rotation: NavigationModeRotation): void {
    this.navigationModeRotation = rotation
  }

  /**
   * Get the current navigation mode rotation instance, if any.
   */
  getNavigationModeRotation(): NavigationModeRotation | null {
    return this.navigationModeRotation
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
   * Wait for a team that has all the required roles.
   * Skips teams that are missing any of the specified roles.
   */
  async acquireWaitForRoles(roles: string[], timeout = 60000): Promise<number> {
    const start = Date.now()

    while (true) {
      for (let i = 0; i < this.teams.length; i++) {
        if (this.inUse.has(i)) continue
        const teamRoles = Object.keys(this.teams[i].actors)
        if (roles.every(r => teamRoles.includes(r))) {
          this.inUse.add(i)
          return i
        }
      }

      if (Date.now() - start > timeout) {
        throw new Error(
          `Timeout: no available team has roles [${roles.join(', ')}]`
        )
      }

      await new Promise(r => setTimeout(r, 100))
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
    baseUrl?: string,
    fuzzyFingers: boolean = false,
    noPanel?: boolean,
    consoleErrors?: boolean | 'error' | 'warn'
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
      this.deviceRotation,
      this.warmupCache,
      this.navigationModeRotation,
      fuzzyFingers,
      noPanel,
      consoleErrors
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
  private actorNavigationModes = new Map<string, NavigationMode>()
  private bus = new MessageBus()
  readonly timeline: TimelineEntry[] = []
  readonly assertions: AssertionResult[] = []
  readonly warnings: ScriptWarning[] = []
  readonly consoleErrors: ConsoleError[] = []

  /** Team metadata (name, tags) */
  readonly meta: TeamMeta

  /** Which console message types to capture */
  private consoleErrorMode: false | 'error' | 'warn'

  constructor(
    private browser: Browser,
    private team: TeamConfig,
    meta: TeamMeta,
    readonly teamIndex: number,
    readonly actionTimeout: number,
    readonly warnAfter: number,
    private baseUrl?: string,
    private deviceRotation?: DeviceRotation | null,
    private warmupCache: WarmupCache = new WarmupCache(),
    private navigationModeRotation?: NavigationModeRotation | null,
    private fuzzyFingers: boolean = false,
    private noPanel?: boolean,
    consoleErrors?: boolean | 'error' | 'warn'
  ) {
    this.meta = meta
    // Default: capture errors
    this.consoleErrorMode = consoleErrors === false ? false : consoleErrors === 'warn' ? 'warn' : 'error'
  }

  /**
   * Wire console error and uncaught exception listeners on a page.
   */
  private wireConsoleListener(page: Page, role: string): void {
    if (this.consoleErrorMode === false) return

    const captureWarnings = this.consoleErrorMode === 'warn'
    page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error' || (captureWarnings && type === 'warning')) {
        this.consoleErrors.push({
          message: msg.text(),
          actor: role,
          timestamp: Date.now(),
          type: type === 'warning' ? 'warning' : 'error',
          source: 'console',
          url: page.url(),
        })
      }
    })

    // Capture uncaught exceptions and unhandled promise rejections
    page.on('pageerror', (error: Error) => {
      this.consoleErrors.push({
        message: error.message,
        actor: role,
        timestamp: Date.now(),
        type: 'error',
        source: 'pageerror',
        url: page.url(),
      })
    })
  }

  /**
   * Build context options for a role, merging device emulation, baseURL,
   * warmup storageState (lazy — runs on first use), and actor localStorage.
   */
  private async buildContextOptions(role: string, device: DeviceProfile | null): Promise<Record<string, unknown>> {
    const config = this.team[role]

    // Lazy warmup: runs on first use, cached for subsequent scenes
    const warmupState = config
      ? await this.warmupCache.ensure(this.browser, config, this.baseUrl ?? '', this.actionTimeout)
      : undefined
    const hasLocalStorage = config?.localStorage && Object.keys(config.localStorage).length > 0

    let storageState: StorageState | undefined
    if (warmupState || hasLocalStorage) {
      // Clone warmup state or start fresh
      storageState = warmupState
        ? JSON.parse(JSON.stringify(warmupState))
        : { cookies: [], origins: [] }

      // Merge actor localStorage if present
      if (hasLocalStorage && this.baseUrl) {
        const origin = new URL(this.baseUrl).origin
        let originEntry = storageState!.origins.find(o => o.origin === origin)
        if (!originEntry) {
          originEntry = { origin, localStorage: [] }
          storageState!.origins.push(originEntry)
        }

        for (const [name, value] of Object.entries(config!.localStorage!)) {
          // Actor config overrides warmup entries with same name
          const existing = originEntry.localStorage.findIndex(e => e.name === name)
          if (existing >= 0) {
            originEntry.localStorage[existing].value = value
          } else {
            originEntry.localStorage.push({ name, value })
          }
        }
      }
    }

    return {
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
      ...(device ? device.contextOptions : {}),
      ...(storageState ? { storageState } : {}),
    }
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
   * Get the navigation mode assigned to an actor role.
   * If rotation is enabled, assigns and caches a mode for this role.
   * If rotation is not enabled, returns 'pointer'.
   * Used by flow() to pass the mode to ConcurrentActorHandleImpl.
   */
  getNavigationMode(role: string): NavigationMode {
    // Return cached mode if already assigned
    const existing = this.actorNavigationModes.get(role)
    if (existing) return existing

    const mode = this.navigationModeRotation?.next() ?? 'pointer'
    this.actorNavigationModes.set(role, mode)
    return mode
  }

  /**
   * Get whether fuzzy-finger touch behavior is enabled.
   * Used by flow() to pass to ConcurrentActorHandleImpl.
   */
  getFuzzyFingers(): boolean {
    return this.fuzzyFingers
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

    // Determine navigation mode for this actor (if rotation is enabled)
    const navMode = this.getNavigationMode(role)

    // Create context with storageState + device emulation + baseURL
    const contextOptions = await this.buildContextOptions(role, device)
    const context = await this.browser.newContext(contextOptions)
    const page = await context.newPage()

    // Suppress dev panel if --no-panel was passed
    if (this.noPanel) {
      await page.addInitScript(() => {
        ;(window as unknown as Record<string, unknown>).__scenetest_panel = true
      })
    }

    // Track device name and navigation mode for assertions
    const deviceName = device?.name
    const navigationMode = navMode !== 'pointer' ? navMode : undefined

    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      const enriched = {
        ...result,
        actor: role,
        ...(deviceName ? { device: deviceName } : {}),
        ...(navigationMode ? { navigationMode } : {}),
      }
      this.assertions.push(enriched)
    })

    // Wire console error listener
    this.wireConsoleListener(page, role)

    this.contexts.set(role, context)

    // Log assignments
    const assignments: string[] = []
    if (device) assignments.push(`device: ${device.name} (${device.category})`)
    if (navMode === 'keyboard') assignments.push('navigation: keyboard')
    if (assignments.length > 0) {
      console.log(`    [${role}] ${assignments.join(', ')}`)
    }

    return page
  }

  /**
   * Create a page factory for a role.
   *
   * The returned factory closes the current browser context for this role,
   * creates a new one (optionally with device emulation), wires up assertion
   * collection, and returns the new page + context.
   *
   * Used by `switchDevice()` on both actor models.
   */
  createPageFactory(role: string): PageFactory {
    return async (device: DeviceProfile | null) => {
      // Close old context for this role
      const oldContext = this.contexts.get(role)
      if (oldContext) {
        await oldContext.close()
      }

      // Resolve device: explicit > rotation > none
      const resolvedDevice = device ?? this.deviceRotation?.next() ?? null
      if (resolvedDevice) {
        this.actorDevices.set(role, resolvedDevice)
      }

      const deviceName = resolvedDevice?.name

      const contextOptions = {
        ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
        ...(resolvedDevice ? resolvedDevice.contextOptions : {}),
      }
      const context = await this.browser.newContext(contextOptions)
      const page = await context.newPage()

      await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
        const enriched = { ...result, actor: role, ...(deviceName ? { device: deviceName } : {}) }
        this.assertions.push(enriched)
      })

      // Wire console error listener
      this.wireConsoleListener(page, role)

      this.contexts.set(role, context)

      if (resolvedDevice) {
        console.log(`    [${role}] switched to device: ${resolvedDevice.name} (${resolvedDevice.category})`)
      }

      return { page, context }
    }
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

    // Determine navigation mode for this actor (if rotation is enabled)
    const navMode = this.getNavigationMode(role)

    // Create new browser context with storageState + device emulation + baseURL
    const contextOptions = await this.buildContextOptions(role, device)
    const context = await this.browser.newContext(contextOptions)
    const page = await context.newPage()

    // Suppress dev panel if --no-panel was passed
    if (this.noPanel) {
      await page.addInitScript(() => {
        ;(window as unknown as Record<string, unknown>).__scenetest_panel = true
      })
    }

    // Track device name and navigation mode for assertions
    const deviceName = device?.name
    const navigationMode = navMode !== 'pointer' ? navMode : undefined

    // Set up assertion collection
    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      const enriched = {
        ...result,
        actor: role,
        ...(deviceName ? { device: deviceName } : {}),
        ...(navigationMode ? { navigationMode } : {}),
      }
      this.assertions.push(enriched)
    })

    // Wire console error listener
    this.wireConsoleListener(page, role)

    // Create page factory for switchDevice support
    const pageFactory = this.createPageFactory(role)

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
      this.warnAfter,
      navMode,
      this.fuzzyFingers,
      pageFactory
    )

    this.contexts.set(role, context)
    this.actors.set(role, actor)

    // Log assignments
    const assignments: string[] = []
    if (device) assignments.push(`device: ${device.name} (${device.category})`)
    if (navMode === 'keyboard') assignments.push('navigation: keyboard')
    if (assignments.length > 0) {
      console.log(`    [${role}] ${assignments.join(', ')}`)
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
   * Get the navigation mode assigned to an actor role (from cache)
   */
  getActorNavigationMode(role: string): NavigationMode | undefined {
    return this.actorNavigationModes.get(role)
  }

  /**
   * Get all actor-navigation-mode assignments
   */
  getActorNavigationModes(): Map<string, NavigationMode> {
    return this.actorNavigationModes
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
    this.actorNavigationModes.clear()
    this.bus.clear()
  }
}
