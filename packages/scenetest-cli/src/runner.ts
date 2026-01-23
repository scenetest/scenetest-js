import { chromium, firefox, webkit, type Browser } from 'playwright'
import { glob } from 'glob'
import { pathToFileURL } from 'url'
import path from 'path'
import type { ScenetestConfig, RunReport, SceneReport } from './types.js'
import { CastManager } from './cast-manager.js'
import { sceneRegistry, setCurrentFile, runScene } from './scene.js'

/**
 * Main scene runner
 */
export class SceneRunner {
  private browser: Browser | null = null
  private castManager: CastManager

  constructor(private config: ScenetestConfig) {
    this.castManager = new CastManager(config.casts)
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

    this.castManager.setBrowser(this.browser)
  }

  /**
   * Discover scene files
   */
  async discoverScenes(): Promise<string[]> {
    const pattern = this.config.scenes.endsWith('.spec.ts')
      ? this.config.scenes
      : path.join(this.config.scenes, '**/*.spec.ts')

    const files = await glob(pattern, {
      ignore: this.config.ignore || [],
      absolute: true,
    })

    // Sort alphabetically
    return files.sort()
  }

  /**
   * Load scene files and populate registry
   */
  async loadScenes(files: string[]): Promise<void> {
    // Clear registry
    sceneRegistry.length = 0

    for (const file of files) {
      setCurrentFile(file)
      // Dynamic import of scene file
      await import(pathToFileURL(file).href)
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

    for (const registered of sceneRegistry) {
      // Run beforeEach hook
      if (this.config.beforeEach) {
        await this.config.beforeEach({ name: registered.name, file: registered.file })
      }

      // Acquire a cast
      const castIndex = await this.castManager.acquireWait()

      try {
        // Create session
        const session = await this.castManager.createSession(castIndex, actionTimeout)

        try {
          // Run the scene
          const report = await runScene(registered, session, timeout)
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
        // Release cast
        this.castManager.release(castIndex)
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

    return {
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
      },
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

  if (report.summary.assertions.failed > 0) {
    console.log(`\n  ⚠ ${report.summary.assertions.failed} assertion(s) failed`)
  }

  if (report.summary.failed > 0) {
    console.log(`\n  ✗ ${report.summary.failed} scene(s) failed`)
  }

  console.log('')
}
