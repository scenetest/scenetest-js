#!/usr/bin/env node

import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import { loadConfig } from './config.js'
import { SceneRunner, printSummary } from './runner.js'
import { init } from './init.js'
import { finish as soundFinish, resolveSoundEnabled } from './sound.js'
import {
  gatherProjectContext,
  generatePrompt,
  formatPromptOutput,
  type PromptType,
} from './prompt-generator.js'
import type { CLIOptions, RunReport } from './types.js'

const program = new Command()

program
  .name('scenetest')
  .description('Run scenetest scene specs')
  .version('0.7.0')
  .argument('[scenes...]', 'Scene files or directories to run')
  .option('--ui', 'Run in interactive UI mode')
  .option('--headed', 'Run with visible browser')
  .option('--report <dir>', 'Report output directory')
  .option('--format <format>', 'Report format (html, json, both)')
  .option('--config <path>', 'Path to config file')
  .option('--devices', 'Enable device rotation (assign each actor a rotating mobile/tablet/desktop device)')
  .option('--no-keyboard-actor', 'Disable keyboard-only actor rotation (keyboard navigation is ON by default)')
  .option('--fuzzy-fingers', 'Enable fuzzy-finger touch behavior (simulates imprecise human touch ~1 in 5 clicks)')
  .option('--swarm', 'Force swarm mode: run all teams against all scenes to classify failures')
  .option('--no-panel', 'Suppress the dev panel in the browser (useful for CI / headless runs)')
  .option('--sound', 'Enable terminal-bell sound feedback (1 bell pass, 2 fail, 3 finish)')
  .option('--no-sound', 'Disable terminal-bell sound feedback')
  .action(async (scenes: string[], options: CLIOptions) => {
    try {
      // Load config and discover actor teams
      const { config, teams } = await loadConfig(options.config)

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

      // Interactive UI mode
      if (options.ui) {
        config.headed = true
        console.log('\n🎬 Scenetest UI Mode\n')
        console.log('Press Ctrl+C to exit\n')
      }

      // Create runner
      const runner = new SceneRunner(config, teams)

      // Initialize browser
      await runner.init()

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
        if (!options.ui) {
          await runner.close()
        }
      }

      if (exitCode !== 0) {
        process.exit(exitCode)
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
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
 * Write report to files
 */
async function writeReport(
  report: RunReport,
  dir: string,
  format: 'html' | 'json' | 'both'
): Promise<void> {
  // Create report directory
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  // Write JSON report
  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(dir, `report-${timestamp}.json`)
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
    console.log(`Report written to: ${jsonPath}`)
  }

  // Write HTML report
  if (format === 'html' || format === 'both') {
    const htmlPath = path.join(dir, `report-${timestamp}.html`)
    fs.writeFileSync(htmlPath, generateHtmlReport(report))
    console.log(`Report written to: ${htmlPath}`)
  }
}

/**
 * Generate an HTML report
 */
function generateHtmlReport(report: RunReport): string {
  const passedColor = '#22c55e'
  const failedColor = '#ef4444'
  const warnColor = '#f59e0b'

  const sceneRows = report.scenes
    .map((scene, i) => {
      const statusIcon =
        scene.status === 'completed' ? '✓' : scene.status === 'timeout' ? '⏱' : '✗'
      const statusColor = scene.status === 'completed' ? passedColor : failedColor

      const assertionList = scene.assertions
        .map((a) => {
          const icon = a.result ? '✓' : '✗'
          const color = a.result ? passedColor : failedColor
          const deviceTag = a.device ? ` <span class="device-tag">[${escapeHtml(a.device)}]</span>` : ''
          return `<li style="color: ${color}">${icon} ${escapeHtml(a.description)}${deviceTag}</li>`
        })
        .join('')

      // Device info for actors
      const actorDevices = Object.entries(scene.actors)
        .filter(([, a]) => a.device)
        .map(([role, a]) => `<span class="device-badge">${escapeHtml(role)}: ${escapeHtml(a.device!)}</span>`)
        .join(' ')

      return `
        <div class="scene" id="scene-${i}">
          <div class="scene-header">
            <h3 style="color: ${statusColor}">${statusIcon} ${escapeHtml(scene.name)}</h3>
            <button class="copy-btn" onclick="copyScene(${i})" title="Copy this test result">Copy</button>
          </div>
          <p class="meta">File: ${escapeHtml(scene.file)} | Duration: ${scene.duration}ms | Team: ${scene.team?.name ? escapeHtml(scene.team.name) : String(scene.teamIndex)}</p>
          ${actorDevices ? `<p class="devices">${actorDevices}</p>` : ''}
          ${scene.error ? `<p class="error" title="Click to expand">Error: ${escapeHtml(scene.error)}</p>` : ''}
          <h4>Assertions (${scene.assertions.length})</h4>
          <ul>${assertionList || '<li>No assertions</li>'}</ul>
        </div>
      `
    })
    .join('')

  // Swarm section
  let swarmSection = ''
  if (report.swarm) {
    const swarm = report.swarm
    const swarmRows = swarm.results
      .map((r) => {
        const color = r.classification === 'healthy' ? passedColor
          : r.classification === 'broken' ? failedColor
          : r.classification === 'flaky' ? warnColor
          : '#8b5cf6'
        return `
          <div class="scene" style="border-left: 4px solid ${color}">
            <h3>${escapeHtml(r.name)}</h3>
            <p class="meta">
              Classification: <strong style="color: ${color}">${escapeHtml(r.classification.toUpperCase())}</strong> |
              Passed: ${r.passed}/${r.runs} |
              Failing teams: ${r.failingTeams.length > 0 ? r.failingTeams.join(', ') : 'none'}
            </p>
          </div>
        `
      })
      .join('')

    swarmSection = `
      <h2>Swarm Results (${swarm.trigger})</h2>
      <div class="summary">
        <div class="summary-card" style="border-top: 3px solid ${failedColor}">
          <h2>${swarm.summary.broken}</h2><p>Broken</p>
        </div>
        <div class="summary-card" style="border-top: 3px solid ${warnColor}">
          <h2>${swarm.summary.flaky}</h2><p>Flaky</p>
        </div>
        <div class="summary-card" style="border-top: 3px solid #8b5cf6">
          <h2>${swarm.summary.seedDataEdgeCase}</h2><p>Seed Data Edge</p>
        </div>
        <div class="summary-card" style="border-top: 3px solid ${passedColor}">
          <h2>${swarm.summary.healthy}</h2><p>Healthy</p>
        </div>
      </div>
      ${swarmRows}
    `
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Scenetest Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .logo { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: rgba(80, 70, 229, 0.12); box-shadow: inset 0 2px 6px rgba(80, 70, 229, 0.25), inset 0 -1px 2px rgba(255, 255, 255, 0.5); font-size: 1.5rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f5f5f5; padding: 1rem; border-radius: 8px; text-align: center; }
    .summary-card h2 { margin: 0; font-size: 2rem; }
    .summary-card p { margin: 0.5rem 0 0; color: #666; }
    .scene { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    .scene-header { display: flex; align-items: flex-start; justify-content: space-between; }
    .scene-header h3 { margin-top: 0; flex: 1; }
    .meta { color: #666; font-size: 0.9rem; }
    .error {
      color: ${failedColor}; background: #fef2f2; padding: 0.5rem; border-radius: 4px;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
      cursor: pointer; white-space: pre-wrap; word-break: break-word;
    }
    .error.expanded { -webkit-line-clamp: unset; }
    .devices { margin: 0.5rem 0; }
    .device-badge { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; margin-right: 4px; }
    .device-tag { color: #6366f1; font-size: 0.85em; }
    ul { list-style: none; padding-left: 0; }
    li { padding: 0.25rem 0; }
    .copy-btn {
      background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 4px 12px;
      font-size: 0.8rem; color: #555; cursor: pointer; white-space: nowrap; flex-shrink: 0;
    }
    .copy-btn:hover { background: #e5e5e5; }
    .copy-btn.copied { background: ${passedColor}; color: white; border-color: ${passedColor}; }
    .report-actions { display: flex; gap: 0.5rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1><span class="logo">🎬</span> Scenetest Report</h1>
  <p>Generated: ${report.timestamp}</p>
  <div class="report-actions">
    <button class="copy-btn" onclick="copyFullReport()" id="copy-all-btn">Copy Full Report</button>
  </div>

  <div class="summary">
    <div class="summary-card">
      <h2>${report.summary.completed}/${report.summary.scenes}</h2>
      <p>Scenes Completed</p>
    </div>
    <div class="summary-card">
      <h2 style="color: ${report.summary.assertions.failed > 0 ? failedColor : passedColor}">
        ${report.summary.assertions.passed}/${report.summary.assertions.total}
      </h2>
      <p>Assertions Passed</p>
    </div>
    <div class="summary-card">
      <h2>${report.duration}ms</h2>
      <p>Total Duration</p>
    </div>
  </div>

  ${sceneRows ? `<h2>Scenes</h2>${sceneRows}` : ''}
  ${swarmSection}

  <script>
    var reportData = ${JSON.stringify(report)};

    function formatScene(scene) {
      var status = scene.status === 'completed' ? 'PASSED' : scene.status === 'timeout' ? 'TIMEOUT' : 'FAILED';
      var icon = scene.status === 'completed' ? '✓' : scene.status === 'timeout' ? '⏱' : '✗';
      var lines = [];
      lines.push(icon + ' ' + scene.name + ' — ' + status);
      lines.push('  File: ' + scene.file + ' | Duration: ' + scene.duration + 'ms | Team: ' + (scene.team && scene.team.name ? scene.team.name : String(scene.teamIndex)));
      var actors = Object.entries(scene.actors).filter(function(e) { return e[1].device; });
      if (actors.length) {
        lines.push('  Devices: ' + actors.map(function(e) { return e[0] + ': ' + e[1].device; }).join(', '));
      }
      if (scene.error) {
        lines.push('  Error: ' + scene.error);
      }
      if (scene.assertions.length) {
        lines.push('  Assertions (' + scene.assertions.length + '):');
        scene.assertions.forEach(function(a) {
          var aIcon = a.result ? '✓' : '✗';
          var device = a.device ? ' [' + a.device + ']' : '';
          lines.push('    ' + aIcon + ' ' + a.description + device);
        });
      }
      return lines.join('\\n');
    }

    function formatFullReport() {
      var r = reportData;
      var lines = [];
      lines.push('Scenetest Report');
      lines.push('Generated: ' + r.timestamp);
      lines.push('Scenes: ' + r.summary.completed + '/' + r.summary.scenes + ' completed | Assertions: ' + r.summary.assertions.passed + '/' + r.summary.assertions.total + ' passed | Duration: ' + r.duration + 'ms');
      lines.push('');
      r.scenes.forEach(function(scene) {
        lines.push(formatScene(scene));
        lines.push('');
      });
      if (r.swarm) {
        lines.push('Swarm Results (' + r.swarm.trigger + ')');
        lines.push('Broken: ' + r.swarm.summary.broken + ' | Flaky: ' + r.swarm.summary.flaky + ' | Seed Data Edge: ' + r.swarm.summary.seedDataEdgeCase + ' | Healthy: ' + r.swarm.summary.healthy);
        r.swarm.results.forEach(function(s) {
          lines.push('  ' + s.name + ' — ' + s.classification.toUpperCase() + ' (' + s.passed + '/' + s.runs + ' passed' + (s.failingTeams.length ? ', failing: ' + s.failingTeams.join(', ') : '') + ')');
        });
      }
      return lines.join('\\n').trim();
    }

    function flashCopied(btn) {
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    }

    function copyFullReport() {
      navigator.clipboard.writeText(formatFullReport()).then(function() {
        flashCopied(document.getElementById('copy-all-btn'));
      });
    }

    function copyScene(index) {
      var text = formatScene(reportData.scenes[index]);
      var btn = document.querySelector('#scene-' + index + ' .copy-btn');
      navigator.clipboard.writeText(text).then(function() {
        flashCopied(btn);
      });
    }

    document.querySelectorAll('.error').forEach(function(el) {
      el.addEventListener('click', function() { el.classList.toggle('expanded'); });
    });
  </script>
</body>
</html>
`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

program.parse()
