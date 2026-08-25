import path from 'path'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

/**
 * Playwright is a peer dependency of @scenetest/scenes: the consumer declares
 * it, so its bin is linked and exactly one copy backs both the browser
 * download and the run. This module turns the two ways that contract breaks —
 * no playwright, no browser binaries — into instructions instead of a stack
 * trace, and backs `scenetest install`.
 */

export const MISSING_PLAYWRIGHT_MESSAGE = [
  'playwright is not installed.',
  '',
  'Scenetest drives the browser through playwright, and declares it as a peer',
  'dependency so your project keeps exactly one copy of it. Install it, then',
  'install the browser builds:',
  '',
  '  pnpm add -D playwright',
  '  pnpm exec scenetest install',
].join('\n')

export const MISSING_BROWSER_MESSAGE = [
  'The browser build is not installed.',
  '',
  'Install the browsers playwright needs:',
  '',
  '  pnpm exec scenetest install',
].join('\n')

/** True if `err` is Node failing to resolve the playwright package. */
export function isMissingPlaywrightError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') return false
  return /'playwright'|"playwright"/.test((err as Error).message ?? '')
}

/** True if `err` is playwright reporting that a browser build is missing. */
export function isMissingBrowserError(err: unknown): boolean {
  const message = (err as Error | null)?.message ?? ''
  return /Executable doesn't exist|please run the following command to download new browsers/i.test(
    message
  )
}

/**
 * Absolute path to the `cli.js` of the playwright copy scenetest itself loads.
 * Resolving through `playwright/package.json` (an exported path) finds the
 * package root without depending on playwright exporting its CLI.
 *
 * Throws with MISSING_PLAYWRIGHT_MESSAGE if playwright is not installed.
 */
export function resolvePlaywrightCli(): string {
  let packageJson: string
  try {
    // `playwright/package.json` is an unconditional export, so require
    // resolution reaches it. `import.meta.resolve` covers the loaders that
    // give us no CJS resolver.
    packageJson = createRequire(import.meta.url).resolve('playwright/package.json')
  } catch {
    try {
      packageJson = fileURLToPath(import.meta.resolve('playwright/package.json'))
    } catch {
      throw new Error(MISSING_PLAYWRIGHT_MESSAGE)
    }
  }
  return path.join(path.dirname(packageJson), 'cli.js')
}

/**
 * Run `playwright install <args>` against scenetest's own resolved playwright,
 * so the browser builds match the library that will drive them. Resolves with
 * the child's exit code.
 *
 * The download reports its progress on the CLI's own streams. `stdio` is here
 * for tests, which capture that output instead of printing it.
 */
export function installBrowsers(
  args: string[] = [],
  options: { stdio?: 'inherit' | 'ignore' } = {}
): Promise<number> {
  const cli = resolvePlaywrightCli()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', ...args], {
      stdio: options.stdio ?? 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}
