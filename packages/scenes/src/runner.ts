import { chromium, firefox, webkit, type Browser } from 'playwright'
import { glob } from 'glob'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import type { ScenetestConfig, ResolvedTeam, TeamConfig, TeamMeta, RunReport, SceneReport, RegisteredScene } from './types.js'
import { TeamManager } from './team-manager.js'
import { DeviceRotation } from './devices.js'
import { resolveContextOptions } from './permissions.js'
import { NavigationModeRotation } from './keyboard.js'
import type { NavigationMode } from './keyboard.js'
import { sceneRegistry, setCurrentFile, runScene } from './scene.js'
import { setAliases } from './selectors.js'
import { importFile } from './loader.js'
import { loadMarkdownScene } from './markdown-scene.js'
import { SwarmTrigger, runSwarm } from './swarm.js'
import { registerBuiltinMacros, registerSelectedMacros } from './builtin-macros.js'
import { DashboardReporter, setDashboardReporter, dashboardSend } from './dashboard-reporter.js'
import { tick as soundTick, fail as soundFail } from './sound.js'
import type { RunController } from './run-controller.js'

function formatTeamLabel(teamIndex: number, meta: TeamMeta | undefined): string {
  const name = meta?.name
  return name ? `[team: ${name} #${teamIndex}]` : `[team: #${teamIndex}]`
}

/**
 * Find the first stack frame pointing into the user's scene file, falling
 * back to the first frame that isn't inside scenetest itself or node_modules.
 *
 * Returns absolute path + 1-indexed line, or `null` if no usable frame was
 * found. The location of the scene file is used to bias the match toward
 * user-authored code rather than framework internals.
 */
function findFailingFrame(
  stack: string | undefined,
  sceneFile: string
): { file: string; line: number } | null {
  if (!stack) return null

  // Stack frames look like "  at fn (/abs/path.ts:12:34)" or
  // "  at /abs/path.ts:12:34" or with file:// URLs.
  const frameRe = /\((file:\/\/[^)]+|\/[^)\s]+):(\d+):\d+\)|at (file:\/\/\S+|\/\S+):(\d+):\d+/g

  const frames: { file: string; line: number }[] = []
  let m: RegExpExecArray | null
  while ((m = frameRe.exec(stack)) !== null) {
    const rawFile = m[1] ?? m[3]
    const rawLine = m[2] ?? m[4]
    if (!rawFile || !rawLine) continue
    const filePath = rawFile.startsWith('file://') ? fileURLToPath(rawFile) : rawFile
    frames.push({ file: filePath, line: parseInt(rawLine, 10) })
  }

  if (frames.length === 0) return null

  // Prefer a frame in the actual scene file
  const sceneFrame = frames.find((f) => f.file === sceneFile)
  if (sceneFrame) return sceneFrame

  // Otherwise pick the first frame that's not in node_modules and not in the
  // scenetest packages themselves
  const userFrame = frames.find(
    (f) => !f.file.includes('/node_modules/') && !/\/packages\/(scenes|checks|vite-plugin)\//.test(f.file)
  )
  return userFrame ?? null
}

/**
 * Read up to 3 lines (the target line + the 2 preceding lines) from `file`,
 * formatted with line-number gutters. Returns `null` if the file can't be
 * read or the line is out of range.
 */
function readSourceContext(file: string, line: number): string | null {
  let contents: string
  try {
    contents = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = contents.split('\n')
  if (line < 1 || line > lines.length) return null

  const start = Math.max(1, line - 2)
  const gutterWidth = String(line).length
  const out: string[] = []
  for (let i = start; i <= line; i++) {
    const num = String(i).padStart(gutterWidth, ' ')
    const marker = i === line ? '>' : ' '
    out.push(`       ${marker} ${num} | ${lines[i - 1]}`)
  }
  return out.join('\n')
}

function formatConsoleEntry(actor: string, label: string, message: string, bodyLimit: number): string {
  const prefix = `      └─ [${actor}]`
  const lines = message.split('\n')
  const atIndex = lines.findIndex(l => /^\s*at /.test(l))

  const body = (atIndex === -1 ? lines : lines.slice(0, atIndex))
    .join(' ').replace(/\s+/g, ' ').trim()
  const truncatedBody = body.length > bodyLimit ? body.slice(0, bodyLimit) + '…' : body

  if (atIndex === -1) {
    return `${prefix} ${label}: ${truncatedBody}`
  }

  // Parse "  at fnName (http://host/path:line:col)" or "  at http://host/path:line:col"
  const raw = lines[atIndex].trim()
  const withParens = raw.match(/^at (.+?) \((.+)\)$/)
  const withoutParens = raw.match(/^at ()(https?:\/\/.+)$/)
  const m = withParens ?? withoutParens

  if (!m) {
    return `${prefix} ${label}: ${truncatedBody} ${raw}`
  }

  const fn = m[1] || ''
  const location = m[2].replace(/^https?:\/\/[^/]+/, '')
  const locLabel = fn ? `${location} in ${fn}` : location
  return `${prefix} ${locLabel}:\n         ${label}: ${truncatedBody}`
}

/**
 * Main scene runner
 */
export class SceneRunner {
  private browser: Browser | null = null
  private teamManager: TeamManager
  private swarmTrigger: SwarmTrigger | null = null
  private controller: RunController | null = null

  constructor(private config: ScenetestConfig, teams: ResolvedTeam[]) {
    this.teamManager = new TeamManager(teams)

    // Apply aliases from config
    if (config.aliases) {
      setAliases(config.aliases)
    }

    // Register built-in macros if configured
    if (config.builtinMacros) {
      if (Array.isArray(config.builtinMacros)) {
        registerSelectedMacros(config.builtinMacros)
      } else {
        registerBuiltinMacros()
      }
    }

    // Pass Playwright context options through to every actor context, with the
    // configured browser's default clipboard permissions filled in
    const contextOptions = resolveContextOptions(
      config.contextOptions,
      config.permissions,
      config.browser ?? 'chromium'
    )
    if (contextOptions) {
      this.teamManager.setContextOptions(contextOptions)
    }

    // Set up device rotation if configured
    if (config.devices) {
      const devices = Array.isArray(config.devices) ? config.devices : undefined
      this.teamManager.setDeviceRotation(new DeviceRotation(devices))
    }

    // Set up keyboard navigation mode rotation (ON by default)
    // This rotates actors through pointer and keyboard modes for accessibility testing
    if (!config.noKeyboardActor) {
      this.teamManager.setNavigationModeRotation(new NavigationModeRotation())
    }

    // Set up swarm trigger if configured
    if (config.swarm) {
      this.swarmTrigger = new SwarmTrigger(config.swarm)
    }
  }

  /** Attach a run controller, consulted at each scene boundary in `runAll()`. */
  attachController(controller: RunController): void {
    this.controller = controller
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
      console.log(`  Device rotation: ON (${rotation.devices.length} devices in pool)`)
    }

    // Log keyboard navigation mode status
    const navRotation = this.teamManager.getNavigationModeRotation()
    if (navRotation) {
      const pool = navRotation.modes
      const keyboardCount = pool.filter(m => m === 'keyboard').length
      console.log(`  Keyboard navigation: ON (${keyboardCount}/${pool.length} actors use keyboard)`)
    }

    if (rotation || navRotation) {
      console.log('')
    }

    dashboardSend({ type: 'run:start', timestamp: Date.now(), sceneCount: sceneRegistry.length })

    for (const registered of sceneRegistry) {
      // Command checkpoint: gate() parks while paused; stop ends the run
      // gracefully, falling through to run:end with whatever completed.
      if (this.controller) {
        await this.controller.gate()
        if (this.controller.isStopped) {
          console.log(`\n■ Run stopped after ${sceneReports.length} scene(s).`)
          break
        }
      }

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
        const fuzzyFingers = !!this.config.fuzzyFingers
        const session = await this.teamManager.createSession(teamIndex, actionTimeout, warnAfter, this.config.baseUrl, fuzzyFingers, this.config.noPanel, this.config.consoleErrors, this.config.errorSelectors)

        try {
          const resolvedTeam = this.teamManager.getTeam(teamIndex)

          // Log which scene is starting (with team label for concurrency debugging)
          const relativeFile = path.relative(path.join(process.cwd(), 'scenetest', 'scenes'), registered.file)
          const fileWithLine = registered.line !== undefined ? `${relativeFile}:${registered.line}` : relativeFile
          const teamLabel = formatTeamLabel(teamIndex, resolvedTeam.meta)
          console.log(`▶ ${registered.name} (${fileWithLine}) ${teamLabel}`)

          const server = this.config.server as Record<string, unknown> | undefined
          const testStart = new Date().toISOString()

          dashboardSend({
            type: 'scene:start',
            timestamp: Date.now(),
            name: registered.name,
            file: relativeFile,
            actors: registered.roles || [],
            teamIndex,
            team: resolvedTeam.meta,
          })

          // Run pre-cleanup if configured
          await runCleanup(registered, resolvedTeam.actors, resolvedTeam.meta, server, testStart, 'before')

          // Run setup if configured (after pre-cleanup, before scene)
          await runSetup(registered, resolvedTeam.actors, resolvedTeam.meta, server, testStart)

          // Run the scene
          const report = await runScene(registered, session, timeout)

          // Run post-cleanup so the next scene starts with the documented
          // pristine state — `cleanup:` is idempotent and runs both sides.
          await runCleanup(registered, resolvedTeam.actors, resolvedTeam.meta, server, testStart, 'after')

          // Enrich actor info with device and navigation mode assignments
          for (const [role, actor] of session.getActors()) {
            const device = session.getActorDevice(role)
            const navMode = session.getActorNavigationMode(role)
            report.actors[role] = {
              key: actor.key,
              username: actor.username,
              ...(device ? { device: device.name } : {}),
              ...(navMode && navMode !== 'pointer' ? { navigationMode: navMode } : {}),
            }
          }

          sceneReports.push(report)

          // Run afterEach hook
          if (this.config.afterEach) {
            await this.config.afterEach({ name: registered.name, file: registered.file }, report)
          }

          dashboardSend({
            type: 'scene:end',
            timestamp: Date.now(),
            name: registered.name,
            status: report.status,
            duration: report.duration,
            error: report.error,
            teamIndex,
            team: resolvedTeam.meta,
          })

          // Log progress
          const failedAssertions = report.assertions.filter((a) => !a.result)
          const sceneFailed = report.status !== 'completed'
          const passed = !sceneFailed && failedAssertions.length === 0
          const statusIcon = passed ? '✓' : report.status === 'timeout' ? '⏱' : '✗'

          if (passed) {
            console.log(`  ${statusIcon} ${registered.name} (${report.duration}ms) ${teamLabel}`)
          } else {
            // Set failing scenes apart with blank lines + a separator so they're
            // easy to scroll to and copy-paste from a long CI log.
            const label = report.status === 'timeout'
              ? 'TIMEOUT'
              : sceneFailed
                ? 'FAIL'
                : 'ASSERTION FAIL'
            console.log('')
            console.log('  ' + '─'.repeat(60))
            console.log(`  ${statusIcon} ${label}: ${registered.name} (${report.duration}ms) ${teamLabel}`)

            // Prefer the failing-line resolved from the stack; fall back to the
            // scene declaration line so we always print something useful.
            const frame = findFailingFrame(report.errorStack, registered.file)
            const displayPath = frame
              ? path.relative(process.cwd(), frame.file)
              : relativeFile
            const displayLine = frame?.line ?? registered.line
            const fileLine = displayLine !== undefined ? `${displayPath}:${displayLine}` : displayPath
            console.log(`     file: ${fileLine}`)

            if (frame) {
              const context = readSourceContext(frame.file, frame.line)
              if (context) {
                console.log(context)
              }
            }

            if (failedAssertions.length > 0) {
              console.log(`     failed assertion(s): ${failedAssertions.length}`)
              for (const a of failedAssertions.slice(0, 5)) {
                const actor = a.actor ? `[${a.actor}] ` : ''
                const loc = a.location ? ` (${path.relative(process.cwd(), a.location.file)}:${a.location.line})` : ''
                console.log(`       ✗ ${actor}${a.description}${loc}`)
              }
              if (failedAssertions.length > 5) {
                console.log(`       … and ${failedAssertions.length - 5} more`)
              }
            }

            if (report.error) {
              console.log(`     error: ${report.error}`)
            }
            console.log('  ' + '─'.repeat(60))
            console.log('')
          }

          if (this.config.sound?.enabled) {
            if (passed) soundTick()
            else soundFail()
          }

          if (report.consoleErrors.length > 0) {
            console.log(`    ⚠ ${report.consoleErrors.length} console error(s)`)
            for (const ce of report.consoleErrors.slice(0, 5)) {
              const label = ce.source === 'selector' ? `error-selector(${ce.selector})` : ce.source === 'pageerror' ? 'uncaught' : ce.type === 'warning' ? 'console.warn' : 'console.error'
              console.log(formatConsoleEntry(ce.actor, label, ce.message, 200))
            }
            if (report.consoleErrors.length > 5) {
              console.log(`      └─ ... and ${report.consoleErrors.length - 5} more`)
            }
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
    const totalConsoleErrors = sceneReports.reduce((sum, r) => sum + r.consoleErrors.length, 0)

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
        consoleErrors: totalConsoleErrors,
      },
    }

    dashboardSend({
      type: 'run:end',
      timestamp: Date.now(),
      duration: report.duration,
      summary: report.summary,
      // A run:stop broke the scene loop early — the summary above still reflects
      // everything that ran, and `cancelled` marks why the run ended.
      cancelled: this.controller?.isStopped ?? false,
    })

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
          consoleErrors: 0,
        },
      }
    }

    const fuzzyFingers = !!this.config.fuzzyFingers
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
      fuzzyFingers,
      this.config.noPanel,
      this.config.consoleErrors,
      this.config.errorSelectors
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
        consoleErrors: 0,
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
          consoleErrors: 0,
        },
      }
    }

    console.log(`\nRunning ${sceneFiles.length} scene file(s)...\n`)

    await this.loadScenes(sceneFiles)

    console.log(`Found ${sceneRegistry.length} scene(s)\n`)

    // Set up live dashboard reporter if we have a baseUrl
    if (this.config.baseUrl) {
      const reporter = new DashboardReporter(this.config.baseUrl)
      setDashboardReporter(reporter)
      console.log(`Dashboard: ${reporter.dashboardUrl}\n`)
    }

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
 * Interpolate `[role.field]`, `[team.field]`, and `[testStart]` tokens in a
 * cleanup/setup expression.
 *
 * Supported tokens:
 * - `[role.field]`  — actor field from the team config (e.g. `[learner.key]`)
 * - `[team.field]`  — team metadata tag (e.g. `[team.lang]`)
 * - `[testStart]`   — ISO 8601 timestamp of when the scene started
 */
function interpolateExpression(
  expression: string,
  team: TeamConfig,
  teamMeta: TeamMeta,
  testStart: string
): string {
  return expression.replace(
    /\[([\w][\w-]*)\.([\w]+)\]|\[testStart\]/g,
    (match, role?: string, field?: string) => {
      // [testStart] — ISO timestamp of scene start
      if (match === '[testStart]') return testStart

      // [team.field] — team metadata tags
      if (role === 'team') {
        const tags = teamMeta.tags ?? {}
        const value = tags[field!] ?? (field === 'name' ? teamMeta.name : undefined)
        if (value === undefined) {
          const available = Object.keys(tags).join(', ')
          throw new Error(
            `cleanup/setup: [team.${field}] — team has no tag "${field}" (available: ${available || 'none'})`
          )
        }
        return String(value)
      }

      // [role.field] — actor field
      const actor = team[role!]
      if (!actor) {
        const available = Object.keys(team).join(', ')
        throw new Error(
          `cleanup/setup: unknown role "${role}" in [${role}.${field}] — available: ${available}`
        )
      }
      const value = actor[field!]
      if (value === undefined) {
        throw new Error(
          `cleanup/setup: role "${role}" has no field "${field}"`
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
 *
 * ### Security note
 *
 * This is intentional eval. The threat model is: cleanup/setup expressions
 * come from `.spec.md` files that the developer wrote and committed to version
 * control, alongside `config.server` they defined in `scenetest.config.ts`.
 * Both inputs are trusted developer-authored code, not user-supplied strings.
 * This is no more dangerous than running `node -e "<expression>"` directly.
 *
 * ### Known limitations
 *
 * - TypeScript cannot type-check the expression — typos surface at runtime.
 * - Stack traces don't point to the spec file line.
 * - There is no sandbox; the expression can call anything on the server objects.
 *
 * ### Future direction
 *
 * A registry approach (`config.cleanups: { 'name': (ctx) => ... }`) would give
 * full type safety and proper stack traces at the cost of moving cleanup logic
 * out of the spec file. Tracked as a potential 0.x API change.
 */
function evaluateCleanup(expression: string, server: Record<string, unknown>): unknown {
  const keys = Object.keys(server)
  const values = Object.values(server)
  const fn = new Function(...keys, `return ${expression}`)
  return fn(...values)
}

/**
 * Run cleanup for a scene if it has cleanup expressions.
 * Each expression is interpolated, evaluated with server context, and awaited.
 * Never throws — failures are logged but don't prevent the scene.
 *
 * `phase` controls the suffix on the success log so before/after passes are
 * distinguishable. The runner calls this twice per scene — once before
 * `setup` and once after the scene finishes — so cleanup statements stay
 * idempotent regardless of which scene ran previously.
 */
export async function runCleanup(
  registered: RegisteredScene,
  team: TeamConfig,
  teamMeta: TeamMeta,
  server: Record<string, unknown> | undefined,
  testStart: string,
  phase: 'before' | 'after' = 'before'
): Promise<void> {
  if (!registered.cleanup || registered.cleanup.length === 0) return

  if (!server || Object.keys(server).length === 0) {
    console.warn(`  ⚠ cleanup (${phase}): expressions present but no server config provided`)
    return
  }

  for (const expr of registered.cleanup) {
    try {
      const interpolated = interpolateExpression(expr, team, teamMeta, testStart)
      const result = evaluateCleanup(interpolated, server)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        await result
      }
    } catch (err) {
      console.warn(
        `  ⚠ cleanup (${phase}) failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  console.log(`  ♻ cleanup ran (${phase})`)
}

/**
 * Run setup expressions for a scene (after pre-cleanup, before scene steps).
 * Each expression is interpolated, evaluated with server context, and awaited.
 * Never throws — failures are logged but don't prevent the scene.
 */
export async function runSetup(
  registered: RegisteredScene,
  team: TeamConfig,
  teamMeta: TeamMeta,
  server: Record<string, unknown> | undefined,
  testStart: string
): Promise<void> {
  if (!registered.setup || registered.setup.length === 0) return

  if (!server || Object.keys(server).length === 0) {
    console.warn(`  ⚠ setup: expressions present but no server config provided`)
    return
  }

  for (const expr of registered.setup) {
    try {
      const interpolated = interpolateExpression(expr, team, teamMeta, testStart)
      const result = evaluateCleanup(interpolated, server)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        await result
      }
    } catch (err) {
      console.warn(
        `  ⚠ setup failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  console.log(`  ♻ setup ran`)
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

  if (report.summary.consoleErrors > 0) {
    console.log(`\n  🔴 ${report.summary.consoleErrors} browser console error(s)`)
    for (const scene of report.scenes) {
      if (scene.consoleErrors.length > 0) {
        console.log(`    ${scene.name}: ${scene.consoleErrors.length} error(s)`)
        for (const ce of scene.consoleErrors.slice(0, 3)) {
          const label = ce.source === 'selector' ? `error-selector(${ce.selector})` : ce.source === 'pageerror' ? 'uncaught' : ce.type === 'warning' ? 'console.warn' : 'console.error'
          console.log(formatConsoleEntry(ce.actor, label, ce.message, 150))
        }
        if (scene.consoleErrors.length > 3) {
          console.log(`      └─ ... and ${scene.consoleErrors.length - 3} more`)
        }
      }
    }
  }

  if (report.summary.failed > 0) {
    console.log(`\n  ✗ ${report.summary.failed} scene(s) failed`)
    for (const scene of report.scenes) {
      if (scene.status !== 'completed') {
        const label = scene.status === 'timeout' ? '⏱ timeout' : '✗ failed'
        console.log(`    ${label}: ${scene.name} ${formatTeamLabel(scene.teamIndex, scene.team)}`)
      }
    }
  }

  // Team usage breakdown — handy for verifying that concurrency actually
  // distributes scenes across the configured teams.
  const teamCounts = new Map<number, { name?: string; count: number }>()
  for (const scene of report.scenes) {
    const entry = teamCounts.get(scene.teamIndex)
    if (entry) entry.count++
    else teamCounts.set(scene.teamIndex, { name: scene.team?.name, count: 1 })
  }
  if (teamCounts.size > 0) {
    console.log(`\n  Teams used: ${teamCounts.size}`)
    const sorted = [...teamCounts.entries()].sort((a, b) => a[0] - b[0])
    for (const [index, { name, count }] of sorted) {
      const label = name ? `${name} #${index}` : `#${index}`
      console.log(`    ${label}: ${count} scene(s)`)
    }
  }

  // Device and navigation mode info
  for (const scene of report.scenes) {
    const actorInfo = Object.entries(scene.actors)
      .filter(([, a]) => a.device || a.navigationMode)
      .map(([role, a]) => {
        const parts: string[] = []
        if (a.device) parts.push(a.device)
        if (a.navigationMode) parts.push(a.navigationMode)
        return `${role}→${parts.join(',')}`
      })
    if (actorInfo.length > 0) {
      console.log(`  ${scene.name}: ${actorInfo.join(', ')}`)
    }
  }

  console.log('')
}
