import type {
  SwarmConfig,
  SwarmReport,
  SwarmSceneResult,
  SwarmRunDetail,
  SwarmClassification,
  RunReport,
  SceneReport,
  RegisteredScene,
} from './types.js'
import type { TeamManager } from './team-manager.js'
import { runScene } from './scene.js'
import { runCleanup } from './runner.js'

/**
 * Default swarm configuration values
 */
const swarmDefaults: Required<SwarmConfig> = {
  failureThreshold: 5,
  windowSize: 3,
  concurrency: Infinity,
  repeats: 3,
  auto: true,
}

/**
 * Resolve partial swarm config with defaults
 */
export function resolveSwarmConfig(config?: SwarmConfig): Required<SwarmConfig> {
  return { ...swarmDefaults, ...config }
}

// ─── Failure Tracking ────────────────────────────────────────────────

/**
 * Tracks failure history across runs for a scene.
 * Used to determine whether swarm mode should be triggered.
 */
interface SceneFailureRecord {
  /** Scene name */
  name: string
  /** Recent run outcomes (true = passed, false = failed). Most recent last. */
  history: boolean[]
  /** Count of consecutive failures at the tail of history */
  consecutiveFailures: number
}

/**
 * Evaluates whether swarm mode should be auto-triggered based on
 * recent run history. Tracks failures across runs and checks whether
 * any scene has exceeded the failure threshold within the window.
 */
export class SwarmTrigger {
  private records = new Map<string, SceneFailureRecord>()
  private config: Required<SwarmConfig>

  constructor(config?: SwarmConfig) {
    this.config = resolveSwarmConfig(config)
  }

  /**
   * Record the results of a run. Call this after each normal run completes.
   */
  recordRun(report: RunReport): void {
    for (const scene of report.scenes) {
      const passed = scene.status === 'completed' && scene.assertions.every((a) => a.result)
      let record = this.records.get(scene.name)
      if (!record) {
        record = { name: scene.name, history: [], consecutiveFailures: 0 }
        this.records.set(scene.name, record)
      }

      record.history.push(passed)

      // Trim history to window size
      if (record.history.length > this.config.windowSize) {
        record.history = record.history.slice(-this.config.windowSize)
      }

      // Count consecutive failures from the end
      record.consecutiveFailures = 0
      for (let i = record.history.length - 1; i >= 0; i--) {
        if (!record.history[i]) {
          record.consecutiveFailures++
        } else {
          break
        }
      }
    }
  }

  /**
   * Check whether swarm mode should be triggered.
   * Returns the names of scenes that have exceeded the failure threshold.
   */
  shouldTrigger(): string[] {
    if (!this.config.auto) return []

    const triggering: string[] = []
    for (const [name, record] of this.records) {
      if (record.consecutiveFailures >= this.config.failureThreshold) {
        triggering.push(name)
      }
    }
    return triggering
  }

  /**
   * Get the failure record for a scene
   */
  getRecord(name: string): SceneFailureRecord | undefined {
    return this.records.get(name)
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.records.clear()
  }
}

// ─── Swarm Execution ─────────────────────────────────────────────────

/**
 * Run swarm mode: execute scenes across ALL teams with multiple repeats.
 *
 * This is the diagnostic mode that runs when failures persist beyond
 * the threshold. It tests every scene against every team multiple times
 * to classify failures as broken, flaky, or seed-data edge cases.
 *
 * @param scenes - Scenes to swarm (all registered, or just the triggering ones)
 * @param teamManager - The team manager with all teams
 * @param config - Swarm configuration
 * @param timeout - Scene timeout
 * @param actionTimeout - Per-action timeout
 * @param warnAfter - Warn threshold
 * @param baseUrl - Application base URL
 * @param trigger - Whether this was auto-triggered or manually requested
 */
export async function runSwarm(
  scenes: RegisteredScene[],
  teamManager: TeamManager,
  config: SwarmConfig | undefined,
  timeout: number,
  actionTimeout: number,
  warnAfter: number,
  baseUrl: string | undefined,
  trigger: 'auto' | 'manual',
  server?: Record<string, unknown>
): Promise<SwarmReport> {
  const resolved = resolveSwarmConfig(config)
  const totalTeams = teamManager.totalCount
  const concurrency = Math.min(resolved.concurrency, totalTeams)

  console.log('\n' + '='.repeat(50))
  console.log('  SWARM MODE')
  console.log('='.repeat(50))
  console.log(`  Trigger:     ${trigger}`)
  console.log(`  Scenes:      ${scenes.length}`)
  console.log(`  Teams:       ${totalTeams}`)
  console.log(`  Repeats:     ${resolved.repeats}`)
  console.log(`  Concurrency: ${concurrency === Infinity ? 'unlimited' : concurrency}`)
  console.log('='.repeat(50) + '\n')

  const results: SwarmSceneResult[] = []

  for (const scene of scenes) {
    console.log(`  Swarming: ${scene.name}`)

    const details: SwarmRunDetail[] = []

    // Build the work queue: every team x every repeat
    interface SwarmTask {
      teamIndex: number
      repeat: number
    }
    const tasks: SwarmTask[] = []
    for (let repeat = 0; repeat < resolved.repeats; repeat++) {
      for (let teamIndex = 0; teamIndex < totalTeams; teamIndex++) {
        tasks.push({ teamIndex, repeat })
      }
    }

    // Execute with concurrency throttle
    const semaphore = new Semaphore(concurrency)

    const taskPromises = tasks.map(async (task) => {
      await semaphore.acquire()
      try {
        // Wait for this specific team to be available
        // (in swarm mode we bypass the normal acquire flow and
        //  coordinate at the task level)
        while (true) {
          const acquired = teamManager.acquire()
          if (acquired === task.teamIndex) break
          // We got a different team, release it
          if (acquired !== null) teamManager.release(acquired)
          await new Promise((r) => setTimeout(r, 50))
        }

        try {
          const session = await teamManager.createSession(
            task.teamIndex,
            actionTimeout,
            warnAfter,
            baseUrl
          )

          try {
            // Run pre-cleanup if configured
            await runCleanup(scene, teamManager.getTeam(task.teamIndex).actors, server)

            const report = await runScene(scene, session, timeout)

            const detail: SwarmRunDetail = {
              teamIndex: task.teamIndex,
              repeat: task.repeat,
              status: report.status,
              duration: report.duration,
              assertionsFailed: report.assertions.filter((a) => !a.result).length,
              assertionsTotal: report.assertions.length,
              error: report.error,
              actors: {},
            }

            // Capture device info per actor
            for (const [role] of session.getActors()) {
              const device = session.getActorDevice(role)
              detail.actors[role] = { device: device?.name }
            }

            details.push(detail)

            const icon = report.status === 'completed' ? '.' : 'F'
            process.stdout.write(icon)
          } finally {
            await session.close()
          }
        } finally {
          teamManager.release(task.teamIndex)
        }
      } finally {
        semaphore.release()
      }
    })

    await Promise.all(taskPromises)
    process.stdout.write('\n')

    // Classify this scene
    const passed = details.filter((d) => d.status === 'completed' && d.assertionsFailed === 0)
    const failed = details.filter((d) => d.status !== 'completed' || d.assertionsFailed > 0)

    const failingTeamSet = new Set(failed.map((d) => d.teamIndex))
    const passingTeamSet = new Set(passed.map((d) => d.teamIndex))

    const classification = classifyScene(details, totalTeams)

    const result: SwarmSceneResult = {
      name: scene.name,
      file: scene.file,
      runs: details.length,
      passed: passed.length,
      failed: failed.length,
      failingTeams: [...failingTeamSet],
      passingTeams: [...passingTeamSet],
      classification,
      details,
    }

    results.push(result)

    console.log(`    ${classificationLabel(classification)} (${passed.length}/${details.length} passed)`)

    if (classification === 'seed-data-edge-case') {
      console.log(`    Failing teams: ${[...failingTeamSet].join(', ')}`)
    }
  }

  // Build summary
  const summary = {
    broken: results.filter((r) => r.classification === 'broken').length,
    flaky: results.filter((r) => r.classification === 'flaky').length,
    seedDataEdgeCase: results.filter((r) => r.classification === 'seed-data-edge-case').length,
    healthy: results.filter((r) => r.classification === 'healthy').length,
  }

  console.log('\n' + '-'.repeat(50))
  console.log('  Swarm Results')
  console.log('-'.repeat(50))
  if (summary.broken > 0) console.log(`  BROKEN:          ${summary.broken} scene(s)`)
  if (summary.flaky > 0) console.log(`  FLAKY:           ${summary.flaky} scene(s)`)
  if (summary.seedDataEdgeCase > 0) console.log(`  SEED DATA EDGE:  ${summary.seedDataEdgeCase} scene(s)`)
  if (summary.healthy > 0) console.log(`  HEALTHY:         ${summary.healthy} scene(s)`)
  console.log('-'.repeat(50) + '\n')

  return { trigger, results, summary }
}

// ─── Classification ──────────────────────────────────────────────────

/**
 * Classify a scene based on swarm run details.
 *
 * Logic:
 * - If ALL runs failed → broken
 * - If ALL runs passed → healthy
 * - If failures are concentrated on specific teams (and other teams always pass)
 *   → seed-data-edge-case
 * - Otherwise → flaky
 */
function classifyScene(details: SwarmRunDetail[], totalTeams: number): SwarmClassification {
  const allFailed = details.every((d) => d.status !== 'completed' || d.assertionsFailed > 0)
  const allPassed = details.every((d) => d.status === 'completed' && d.assertionsFailed === 0)

  if (allPassed) return 'healthy'
  if (allFailed) return 'broken'

  // Check if failures are team-specific
  // Group by team and check if some teams always fail while others always pass
  const teamResults = new Map<number, { passed: number; failed: number }>()
  for (const detail of details) {
    const entry = teamResults.get(detail.teamIndex) ?? { passed: 0, failed: 0 }
    if (detail.status === 'completed' && detail.assertionsFailed === 0) {
      entry.passed++
    } else {
      entry.failed++
    }
    teamResults.set(detail.teamIndex, entry)
  }

  // A team "always fails" if it never passed
  // A team "always passes" if it never failed
  const alwaysFailing = [...teamResults.entries()].filter(([, r]) => r.passed === 0)
  const alwaysPassing = [...teamResults.entries()].filter(([, r]) => r.failed === 0)

  // If there are teams that always fail AND teams that always pass,
  // this looks like a seed-data edge case
  if (alwaysFailing.length > 0 && alwaysPassing.length > 0) {
    return 'seed-data-edge-case'
  }

  // Otherwise it's flaky — failures are spread across teams
  return 'flaky'
}

/**
 * Human-readable label for a classification
 */
function classificationLabel(c: SwarmClassification): string {
  switch (c) {
    case 'broken': return 'BROKEN - fails consistently'
    case 'flaky': return 'FLAKY - intermittent failures'
    case 'seed-data-edge-case': return 'SEED DATA EDGE CASE - team-specific failures'
    case 'healthy': return 'HEALTHY - passes consistently'
  }
}

// ─── Concurrency Control ─────────────────────────────────────────────

/**
 * Simple counting semaphore for throttling concurrent work.
 */
class Semaphore {
  private count: number
  private waiting: Array<() => void> = []

  constructor(max: number) {
    this.count = max === Infinity ? Number.MAX_SAFE_INTEGER : max
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  release(): void {
    const next = this.waiting.shift()
    if (next) {
      next()
    } else {
      this.count++
    }
  }
}
