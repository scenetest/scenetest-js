import { chromium, firefox, webkit, type Browser } from 'playwright'
import { glob } from 'glob'
import path from 'path'
import type { ScenetestConfig, ResolvedTeam, TeamConfig, RunReport, SceneReport, RegisteredScene } from './types.js'
import { TeamManager } from './team-manager.js'
import { DeviceRotation } from './devices.js'
import { sceneRegistry, setCurrentFile, runScene } from './scene.js'
import { setAliases } from './selectors.js'
import { importFile } from './loader.js'
import { loadMarkdownScene } from './markdown-scene.js'
import { SwarmTrigger, runSwarm } from './swarm.js'

/**
 * Main scene runner
 */
export class SceneRunner {
  private browser: Browser | null = null
  private teamManager: TeamManager
  private swarmTrigger: SwarmTrigger | null = null

  constructor(private config: ScenetestConfig, teams: ResolvedTeam[]) {
    this.teamManager = new TeamManager(teams)

    // Apply aliases from config
    if (config.aliases) {
      setAliases(config.aliases)
    }

    // Set up device rotation if configured
    if (config.devices) {
      const devices = Array.isArray(config.devices) ? config.devices : undefined
      this.teamManager.setDeviceRotation(new DeviceRotation(devices))
    }

    // Set up swarm trigger if configured
    if (config.swarm) {
      this.swarmTrigger = new SwarmTrigger(config.swarm)
    }
  }

  /**
   * Initialize the browser
   */
  async init(): Promise<void> {
    const browserType = this.config.browser || 'chromium'
    const launcher = browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium

    this.browser = await launcher.launch({
      headless: !this.config.headed,
      slowMo: this.config.slowMo,
    })

    this.teamManager.setBrowser(this.browser)
  }

  /**
   * Discover scene files (.spec.ts and .spec.md) from ./scenetest/scenes/
   */
  async discoverScenes(): Promise<string[]> {
    const pattern = path.join('./scenetest/scenes', '**/*.spec.{ts,md}')
    const files = await glob(pattern, {
      ignore: this.config.ignore || [],
      absolute: true,
    })

    return files.sort()
  }

  /**
   * Load scene files and populate registry
   */
  async loadScenes(files: string[]): Promise<void> {
    // Clear registry
    sceneRegistry.length = 0

    for (const file of files) {
      if (file.endsWith('.spec.md')) {
        // Parse markdown scene and register as flow
        await loadMarkdownScene(file)
      } else {
        setCurrentFile(file)
        // Dynamic import of scene file
        await importFile(file)
      }
    }
  }

  /**
   * Run all loaded scenes
   */
  async runAll(): Promise<RunReport> {
    const start = Date.now()
    const sceneReports: SceneReport[] = []

    // Run hooks
    if (this.config.beforeAll) {
      await this.config.beforeAll()
    }

    const timeout = this.config.timeout || 30000
    const actionTimeout = this.config.actionTimeout || 5000
    const warnAfter = this.config.warnAfter || 500

    // Log device rotation status
    const rotation = this.teamManager.getDeviceRotation()
    if (rotation) {
      console.log(`  Device rotation: ON (${rotation.devices.length} devices in pool)\n`)
    }

    for (const registered of sceneRegistry) {
      // Run beforeEach hook
      if (this.config.beforeEach) {
        await this.config.beforeEach({ name: registered.name, file: registered.file })
      }

      // Acquire a team — use role-filtered acquisition if the scene declares roles
      const teamIndex = registered.roles
        ? await this.teamManager.acquireWaitForRoles(registered.roles)
        : await this.teamManager.acquireWait()

      try {
        // Create session
        const session = await this.teamManager.createSession(teamIndex, actionTimeout, warnAfter, this.config.baseUrl, this.config.noPanel)

        try {
          // Log which scene is starting
          const relativeFile = path.relative(path.join(process.cwd(), 'scenetest', 'scenes'), registered.file)
          console.log(`▶ ${registered.name} (${relativeFile})`)

          // Run pre-cleanup if configured
          await runCleanup(
            registered,
            this.teamManager.getTeam(teamIndex).actors,
            this.config.server as Record<string, unknown> | undefined
          )

          // Run the scene
          const report = await runScene(registered, session, timeout)

          // Enrich actor info with device assignments
          for (const [role, actor] of session.getActors()) {
            const device = session.getActorDevice(role)
            report.actors[role] = {
              key: actor.key,
              username: actor.username,
              ...(device ? { device: device.name } : {}),
            }
          }

          sceneReports.push(report)

          // Run afterEach hook
          if (this.config.afterEach) {
            await this.config.afterEach({ name: registered.name, file: registered.file }, report)
          }

          // Log progress
          const statusIcon = report.status === 'completed' ? '✓' : report.status === 'timeout' ? '⏱' : '✗'
          console.log(`  ${statusIcon} ${registered.name} (${report.duration}ms)`)

          if (report.error) {
            console.log(`    Error: ${report.error}`)
          }
        } finally {
          // Close session
          await session.close()
        }
      } finally {
        // Release team
        this.teamManager.release(teamIndex)
      }
    }

    // Run afterAll hook
    if (this.config.afterAll) {
      await this.config.afterAll()
    }

    // Build summary
    const totalAssertions = sceneReports.reduce((sum, r) => sum + r.assertions.length, 0)
    const passedAssertions = sceneReports.reduce(
      (sum, r) => sum + r.assertions.filter((a) => a.result).length,
      0
    )
    const failedAssertions = totalAssertions - passedAssertions
    const totalWarnings = sceneReports.reduce((sum, r) => sum + r.warnings.length, 0)

    const report: RunReport = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      scenes: sceneReports,
      summary: {
        scenes: sceneReports.length,
        completed: sceneReports.filter((r) => r.status === 'completed').length,
        failed: sceneReports.filter((r) => r.status !== 'completed').length,
        assertions: {
          total: totalAssertions,
          passed: passedAssertions,
          failed: failedAssertions,
        },
        warnings: totalWarnings,
      },
    }

    // Record run for swarm trigger evaluation
    if (this.swarmTrigger) {
      this.swarmTrigger.recordRun(report)
    }

    return report
  }

  /**
   * Check if swarm mode should be auto-triggered based on failure history.
   * Returns the scene names that triggered it, or empty array if no trigger.
   */
  checkSwarmTrigger(): string[] {
    return this.swarmTrigger?.shouldTrigger() ?? []
  }

  /**
   * Run swarm mode on specified scenes (or all if none specified).
   * Executes every scene against every team with multiple repeats
   * to classify failures as broken, flaky, or seed-data edge cases.
   */
  async runSwarmMode(
    trigger: 'auto' | 'manual',
    sceneNames?: string[]
  ): Promise<RunReport> {
    const timeout = this.config.timeout || 30000
    const actionTimeout = this.config.actionTimeout || 5000
    const warnAfter = this.config.warnAfter || 500

    // Filter scenes to swarm
    const scenes = sceneNames
      ? sceneRegistry.filter((s) => sceneNames.includes(s.name))
      : [...sceneRegistry]

    if (scenes.length === 0) {
      console.log('No scenes to swarm.')
      return {
        timestamp: new Date().toISOString(),
        duration: 0,
        scenes: [],
        summary: {
          scenes: 0,
          completed: 0,
          failed: 0,
          assertions: { total: 0, passed: 0, failed: 0 },
          warnings: 0,
        },
      }
    }

    const swarmReport = await runSwarm(
      scenes,
      this.teamManager,
      this.config.swarm,
      timeout,
      actionTimeout,
      warnAfter,
      this.config.baseUrl,
      trigger,
      this.config.server as Record<string, unknown> | undefined,
      this.config.noPanel
    )

    // Build a RunReport that includes the swarm results
    return {
      timestamp: new Date().toISOString(),
      duration: 0, // swarm report is supplementary
      scenes: [],  // individual scene reports are in swarmReport.results
      summary: {
        scenes: swarmReport.results.length,
        completed: swarmReport.summary.healthy,
        failed: swarmReport.summary.broken + swarmReport.summary.flaky + swarmReport.summary.seedDataEdgeCase,
        assertions: { total: 0, passed: 0, failed: 0 },
        warnings: 0,
      },
      swarm: swarmReport,
    }
  }

  /**
   * Run specific scene files
   */
  async run(files?: string[]): Promise<RunReport> {
    const sceneFiles = files || (await this.discoverScenes())

    if (sceneFiles.length === 0) {
      console.log('No scene files found.')
      return {
        timestamp: new Date().toISOString(),
        duration: 0,
        scenes: [],
        summary: {
          scenes: 0,
          completed: 0,
          failed: 0,
          assertions: { total: 0, passed: 0, failed: 0 },
          warnings: 0,
        },
      }
    }

    console.log(`\nRunning ${sceneFiles.length} scene file(s)...\n`)

    await this.loadScenes(sceneFiles)

    console.log(`Found ${sceneRegistry.length} scene(s)\n`)

    return this.runAll()
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup expression evaluation
// ---------------------------------------------------------------------------

/**
 * Interpolate `[role.field]` tokens in a cleanup expression with team data.
 *
 * Replaces tokens like `[learner.key]` with the corresponding value from the
 * team config, yielding a string literal in the expression.
 */
function interpolateCleanup(expression: string, team: TeamConfig): string {
  return expression.replace(
    /\[([\w][\w-]*)\.([\w]+)\]/g,
    (_match, role: string, field: string) => {
      const actor = team[role]
      if (!actor) {
        const available = Object.keys(team).join(', ')
        throw new Error(
          `cleanup: unknown role "${role}" in [${role}.${field}] — available: ${available}`
        )
      }
      const value = actor[field]
      if (value === undefined) {
        throw new Error(
          `cleanup: role "${role}" has no field "${field}"`
        )
      }
      return String(value)
    }
  )
}

/**
 * Evaluate a cleanup expression with `config.server` properties in scope.
 *
 * The expression is evaluated via `new Function()` with server properties
 * destructured as local variables. The result is awaited if it's a promise.
 */
function evaluateCleanup(expression: string, server: Record<string, unknown>): unknown {
  const keys = Object.keys(server)
  const values = Object.values(server)
  const fn = new Function(...keys, `return ${expression}`)
  return fn(...values)
}

/**
 * Run pre-cleanup for a scene if it has a cleanup expression.
 * Interpolates team data, evaluates with server context, and logs errors.
 * Never throws — cleanup failures are logged but don't prevent the scene.
 */
export async function runCleanup(
  registered: RegisteredScene,
  team: TeamConfig,
  server: Record<string, unknown> | undefined
): Promise<void> {
  if (!registered.cleanup) return

  try {
    const interpolated = interpolateCleanup(registered.cleanup, team)

    if (!server || Object.keys(server).length === 0) {
      console.warn(`  ⚠ cleanup: expression references server resources but no server config provided`)
      return
    }

    const result = evaluateCleanup(interpolated, server)
    // Await if promise
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      await result
    }
    console.log(`  ♻ cleanup ran`)
  } catch (err) {
    console.warn(
      `  ⚠ cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Print a summary of the run report
 */
export function printSummary(report: RunReport): void {
  console.log('\n' + '─'.repeat(50))
  console.log('Summary')
  console.log('─'.repeat(50))
  console.log(`  Scenes:     ${report.summary.completed}/${report.summary.scenes} completed`)
  console.log(`  Assertions: ${report.summary.assertions.passed}/${report.summary.assertions.total} passed`)
  console.log(`  Duration:   ${report.duration}ms`)

  if (report.summary.warnings > 0) {
    console.log(`\n  ⚡ ${report.summary.warnings} script warning(s)`)
    // Print details of each warning
    for (const scene of report.scenes) {
      for (const warning of scene.warnings) {
        console.log(`    └─ [${warning.actor}] ${warning.selector}: ${warning.message}`)
        if (warning.duringAction) {
          console.log(`       during: ${warning.duringAction}`)
        }
      }
    }
  }

  if (report.summary.assertions.failed > 0) {
    console.log(`\n  ⚠ ${report.summary.assertions.failed} assertion(s) failed`)
  }

  if (report.summary.failed > 0) {
    console.log(`\n  ✗ ${report.summary.failed} scene(s) failed`)
  }

  // Device rotation info
  for (const scene of report.scenes) {
    const devicesUsed = Object.entries(scene.actors)
      .filter(([, a]) => a.device)
      .map(([role, a]) => `${role}→${a.device}`)
    if (devicesUsed.length > 0) {
      console.log(`  ${scene.name}: ${devicesUsed.join(', ')}`)
    }
  }

  console.log('')
}
