#!/usr/bin/env node

import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import { loadConfig } from './config.js'
import { SceneRunner, printSummary } from './runner.js'
import type { CLIOptions, RunReport } from './types.js'

const program = new Command()

program
  .name('scenetest')
  .description('Run scenetest scene specs')
  .version('0.0.1')
  .argument('[scenes...]', 'Scene files or directories to run')
  .option('--ui', 'Run in interactive UI mode')
  .option('--headed', 'Run with visible browser')
  .option('--report <dir>', 'Report output directory')
  .option('--format <format>', 'Report format (html, json, both)')
  .option('--config <path>', 'Path to config file')
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

      try {
        // Resolve scene file paths
        let sceneFiles: string[] | undefined

        if (scenes.length > 0) {
          sceneFiles = scenes.map((s) => path.resolve(s))
        }

        // Run scenes
        const report = await runner.run(sceneFiles)

        // Print summary
        printSummary(report)

        // Write report
        await writeReport(report, config.reportDir!, config.reportFormat!)

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
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

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

  const sceneRows = report.scenes
    .map((scene) => {
      const statusIcon =
        scene.status === 'completed' ? '✓' : scene.status === 'timeout' ? '⏱' : '✗'
      const statusColor = scene.status === 'completed' ? passedColor : failedColor

      const assertionList = scene.assertions
        .map((a) => {
          const icon = a.result ? '✓' : '✗'
          const color = a.result ? passedColor : failedColor
          return `<li style="color: ${color}">${icon} ${escapeHtml(a.description)}</li>`
        })
        .join('')

      return `
        <div class="scene">
          <h3 style="color: ${statusColor}">${statusIcon} ${escapeHtml(scene.name)}</h3>
          <p class="meta">File: ${escapeHtml(scene.file)} | Duration: ${scene.duration}ms | Team: ${scene.teamIndex}</p>
          ${scene.error ? `<p class="error">Error: ${escapeHtml(scene.error)}</p>` : ''}
          <h4>Assertions (${scene.assertions.length})</h4>
          <ul>${assertionList || '<li>No assertions</li>'}</ul>
        </div>
      `
    })
    .join('')

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
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f5f5f5; padding: 1rem; border-radius: 8px; text-align: center; }
    .summary-card h2 { margin: 0; font-size: 2rem; }
    .summary-card p { margin: 0.5rem 0 0; color: #666; }
    .scene { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    .scene h3 { margin-top: 0; }
    .meta { color: #666; font-size: 0.9rem; }
    .error { color: ${failedColor}; background: #fef2f2; padding: 0.5rem; border-radius: 4px; }
    ul { list-style: none; padding-left: 0; }
    li { padding: 0.25rem 0; }
  </style>
</head>
<body>
  <h1><span class="logo">🎬</span> Scenetest Report</h1>
  <p>Generated: ${report.timestamp}</p>

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

  <h2>Scenes</h2>
  ${sceneRows || '<p>No scenes ran.</p>'}
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

program.parse()
