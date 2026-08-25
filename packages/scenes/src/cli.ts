#!/usr/bin/env node

import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { loadConfig, filterTeamsByName } from './config.js'
import {
  installBrowsers,
  isMissingBrowserError,
  isMissingPlaywrightError,
  MISSING_BROWSER_MESSAGE,
  MISSING_PLAYWRIGHT_MESSAGE,
} from './playwright-install.js'
import { init } from './init.js'
import {
  ReportUrlReporter,
  setReportUrlReporter,
  drainReportUrlReporter,
} from './report-url-reporter.js'
import { RunController } from './run-controller.js'
import { watchCommandFile } from './command-channel.js'
import { dashboardSend, currentRunId } from './dashboard-reporter.js'
import { finish as soundFinish, resolveSoundEnabled } from './sound.js'
import {
  gatherProjectContext,
  generatePrompt,
  formatPromptOutput,
  type PromptType,
} from './prompt-generator.js'
import type { CLIOptions, RunReport } from './types.js'

// Read the version from package.json so `scenetest --version` always matches
// the installed package instead of a hand-maintained literal that drifts.
const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version as string

/**
 * The runner imports playwright at module scope, and playwright is a peer
 * dependency. Loading the runner lazily keeps the rest of the CLI — above all
 * `scenetest install` — reachable on a project that has not installed it yet.
 */
function loadRunner(): Promise<typeof import('./runner.js')> {
  return import('./runner.js')
}

/**
 * Report a broken playwright setup as the instruction that fixes it. Both
 * failures reach the user through the CLI: a missing peer while the run loads
 * playwright, a missing browser build while it launches one.
 */
function reportSetupError(err: unknown): boolean {
  if (isMissingPlaywrightError(err)) {
    console.error(MISSING_PLAYWRIGHT_MESSAGE)
    return true
  }
  if (isMissingBrowserError(err)) {
    console.error(MISSING_BROWSER_MESSAGE)
    return true
  }
  return false
}

const program = new Command()

program
  .name('scenetest')
  .description('Run scenetest scene specs')
  .version(version)
  .argument('[scenes...]', 'Scene files or directories to run')
  .option('--ui', 'Run in interactive UI mode')
  .option('--headed', 'Run with visible browser')
  .option('--report <dir>', 'Report output directory')
  .option('--format <format>', 'Report format (html, json, both)')
  .option('--report-url <url>', 'POST batched protocol events to this HTTP endpoint as the run executes (also honors SCENETEST_REPORT_URL)')
  .option('--command-file <path>', 'Tail this JSONL file for inbound protocol commands (run:stop/pause/resume) steering the active run at scene boundaries (also honors SCENETEST_COMMAND_FILE)')
  .option('--config <path>', 'Path to config file')
  .option('--devices', 'Enable device rotation (assign each actor a rotating mobile/tablet/desktop device)')
  .option('--no-keyboard-actor', 'Disable keyboard-only actor rotation (keyboard navigation is ON by default)')
  .option('--fuzzy-fingers', 'Enable fuzzy-finger touch behavior (simulates imprecise human touch ~1 in 5 clicks)')
  .option('--swarm', 'Force swarm mode: run all teams against all scenes to classify failures')
  .option('--team <name>', 'Restrict the run to a single team by name (matches team.meta.name)')
  .option('--no-panel', 'Suppress the dev panel in the browser (useful for CI / headless runs)')
  .option('--sound', 'Enable terminal-bell sound feedback (1 bell pass, 2 fail, 3 finish)')
  .option('--no-sound', 'Disable terminal-bell sound feedback')
  .action(async (scenes: string[], options: CLIOptions) => {
    try {
      // Load config and discover actor teams
      const { config, teams: allTeams } = await loadConfig(options.config)

      // Filter by --team <name> if provided
      let teams = allTeams
      if (options.team) {
        try {
          teams = filterTeamsByName(allTeams, options.team)
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`)
          process.exit(1)
        }
        console.log(`  Team filter: ${options.team} (${teams.length}/${allTeams.length} teams)\n`)
      }

      // Override config with CLI options
      if (options.headed) {
        config.headed = true
      }
      if (options.report) {
        config.reportDir = options.report
      }
      if (options.format) {
        config.reportFormat = options.format as 'html' | 'json' | 'both'
      }
      if (options.devices) {
        config.devices = true
      }
      if (options.noKeyboardActor) {
        config.noKeyboardActor = true
      }
      if (options.fuzzyFingers) {
        config.fuzzyFingers = true
      }
      if (options.noPanel) {
        config.noPanel = true
      }
      config.sound = { enabled: resolveSoundEnabled(config, options) }

      // Live report-url sink: CLI flag > env var > config. Composes with the
      // local dev middleware / jsonl — it's an additional sink, not a replacement.
      const reportUrl =
        options.reportUrl ?? process.env.SCENETEST_REPORT_URL ?? config.reportUrl
      if (reportUrl) {
        const token = process.env.SCENETEST_REPORT_TOKEN ?? config.reportToken
        setReportUrlReporter(new ReportUrlReporter({ url: reportUrl, token }))
        console.log(`Reporting events to: ${reportUrl}\n`)
      }

      // Interactive UI mode
      if (options.ui) {
        config.headed = true
        console.log('\n🎬 Scenetest UI Mode\n')
        console.log('Press Ctrl+C to exit\n')
      }

      // Create runner
      const { SceneRunner, printSummary } = await loadRunner()
      const runner = new SceneRunner(config, teams)

      // Initialize browser
      await runner.init()

      // Inbound command channel (the mirror of --report-url): tail a file for
      // commands and dispatch them to a RunController the runner consults.
      const commandFile = options.commandFile ?? process.env.SCENETEST_COMMAND_FILE
      let controller: RunController | null = null
      let stopWatching: (() => void) | null = null
      if (commandFile) {
        // Emit paused/resumed facts on real transitions (guarded so a stray
        // pause before run:start doesn't emit a run-less event).
        controller = new RunController({
          onPaused: () => {
            if (currentRunId()) dashboardSend({ type: 'run:paused', timestamp: Date.now() })
          },
          onResumed: () => {
            if (currentRunId()) dashboardSend({ type: 'run:resumed', timestamp: Date.now() })
          },
        })
        runner.attachController(controller)
        const resolved = path.resolve(commandFile)
        stopWatching = watchCommandFile(resolved, (command) => controller!.dispatch(command))
        console.log(`Listening for commands on: ${resolved}\n`)
      }

      let exitCode = 0

      try {
        // Resolve scene file paths
        let sceneFiles: string[] | undefined

        if (scenes.length > 0) {
          sceneFiles = scenes.map((s) => path.resolve(s))
        }

        if (options.swarm) {
          // ── Manual swarm mode ──
          // Load scenes first, then swarm them all
          const discovered = sceneFiles || (await runner.discoverScenes())
          if (discovered.length === 0) {
            console.log('No scene files found.')
          } else {
            await runner.loadScenes(discovered)

            const report = await runner.runSwarmMode('manual')
            printSummary(report)
            await writeReport(report, config.reportDir!, config.reportFormat!)
            if (reportFailed(report)) exitCode = 1
          }
        } else {
          // ── Normal run ──
          // A command channel (if attached) is live for this run, so
          // stop/pause/resume steer it. run:replay relaunches the CLI (the
          // driver's job, as dev does) — a one-shot process can't re-register
          // its module-cached scenes.
          const report = await runner.run(sceneFiles)
          printSummary(report)
          await writeReport(report, config.reportDir!, config.reportFormat!)
          if (reportFailed(report)) exitCode = 1

          // Check if swarm should auto-trigger
          const triggeringScenes = runner.checkSwarmTrigger()
          if (triggeringScenes.length > 0) {
            console.log(`\n⚡ Swarm mode auto-triggered for ${triggeringScenes.length} scene(s):`)
            for (const name of triggeringScenes) {
              console.log(`   - ${name}`)
            }

            const swarmReport = await runner.runSwarmMode('auto', triggeringScenes)
            await writeReport(swarmReport, config.reportDir!, config.reportFormat!)
          }
        }

        if (config.sound?.enabled) soundFinish()

        // In UI mode, keep browser open
        if (options.ui) {
          console.log('Browser will remain open. Press Ctrl+C to exit.\n')
          await new Promise(() => {}) // Wait forever
        }
      } finally {
        // Final synchronous flush so the tail of the run — including run:end —
        // is delivered before we exit.
        stopWatching?.()
        await drainReportUrlReporter()
        if (!options.ui) {
          await runner.close()
        }
      }

      if (exitCode !== 0) {
        process.exit(exitCode)
      }
    } catch (err) {
      if (!reportSetupError(err)) {
        console.error('Error:', err instanceof Error ? err.message : err)
      }
      process.exit(1)
    }
  })

function reportFailed(report: RunReport): boolean {
  return (
    report.summary.failed > 0 ||
    report.summary.completed < report.summary.scenes ||
    report.summary.assertions.failed > 0
  )
}

/**
 * Write the run report to disk.
 *
 * The runner emits a single JSON file per run. The static HTML report has
 * been replaced by the interactive analyze app served by the vite-plugin
 * at `/__scenetest/`, which reads these JSON files via `/__scenetest/runs`.
 *
 * `format` is accepted for backward compatibility but only the JSON file is
 * written. `format: 'html'` is treated as a no-op + warning; `'both'` is
 * equivalent to `'json'`.
 */
async function writeReport(
  report: RunReport,
  dir: string,
  format: 'html' | 'json' | 'both'
): Promise<void> {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = path.join(dir, `report-${timestamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  const id = path.basename(jsonPath, '.json')
  console.log(`Report written to: ${jsonPath}`)
  console.log(`Open in browser:    /__scenetest/runner?run=${id}`)

  if (format === 'html') {
    console.log(
      'Note: --format html is no longer emitted as a static file. ' +
        'Open /__scenetest/ on your dev server for the interactive view.'
    )
  }
}


program
  .command('install')
  .description('Install the browser builds scenetest runs scenes in')
  .argument('[args...]', 'Passed through to `playwright install` (e.g. chromium, --with-deps, --force)')
  .allowUnknownOption()
  .action(async (args: string[]) => {
    // Forward to the playwright scenetest itself resolves, so the browser
    // builds match the library that will drive them.
    try {
      const code = await installBrowsers(args)
      if (code !== 0) process.exit(code)
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('init')
  .description('Initialize scenetest folder structure')
  .option('--force', 'Overwrite existing files')
  .action(async (options: { force?: boolean }) => {
    try {
      await init(process.cwd(), { force: options.force })
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('prompt')
  .description('Generate LLM prompts for team/seed data creation')
  .argument('<type>', 'Prompt type: teams, seeds, or both')
  .option('-o, --output <file>', 'Write prompt to file instead of stdout')
  .action(async (type: string, options: { output?: string }) => {
    if (!['teams', 'seeds', 'both'].includes(type)) {
      console.error(`Error: Invalid prompt type "${type}". Must be: teams, seeds, or both`)
      process.exit(1)
    }

    try {
      console.error('Analyzing project...')
      const ctx = await gatherProjectContext()

      console.error(`Found:`)
      console.error(`  - ${ctx.userModels.length} user/account model files`)
      console.error(`  - ${ctx.dbSchema.length} database schema files`)
      console.error(`  - ${ctx.existingSeeds.length} existing seed files`)
      console.error(`  - ${ctx.existingScenes.length} scene files`)
      console.error(`  - ${ctx.existingActors.length} actor team files`)
      console.error('')

      const prompt = generatePrompt(ctx, type as PromptType)
      const output = formatPromptOutput(prompt, type as PromptType)

      if (options.output) {
        fs.writeFileSync(options.output, output)
        console.error(`Prompt written to: ${options.output}`)
      } else {
        console.log(output)
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command('teams')
  .description('List configured actor teams')
  .option('--json', 'Output the team list as JSON')
  .option('--config <path>', 'Path to config file')
  .action(async (options: { json?: boolean; config?: string }) => {
    try {
      const { teams } = await loadConfig(options.config)
      // Extensible object shape — room to add scenes / eligibility later (#234).
      const list = teams.map((t, index) => ({
        index,
        name: t.meta?.name,
        roles: Object.keys(t.actors),
        tags: t.meta?.tags,
      }))
      if (options.json) {
        // Only the JSON on stdout — consumers (the dev `/teams` endpoint) parse it.
        process.stdout.write(JSON.stringify({ teams: list }) + '\n')
        return
      }
      if (list.length === 0) {
        console.log('No teams configured.')
        return
      }
      for (const t of list) {
        console.log(`#${t.index} ${t.name ?? '(unnamed)'} — roles: ${t.roles.join(', ') || '(none)'}`)
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program.parse()
