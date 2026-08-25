import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  installBrowsers,
  isMissingBrowserError,
  isMissingPlaywrightError,
  resolvePlaywrightCli,
  MISSING_BROWSER_MESSAGE,
  MISSING_PLAYWRIGHT_MESSAGE,
} from '../playwright-install.js'

describe('resolvePlaywrightCli', () => {
  it('points at the cli.js of the playwright scenetest itself loads', () => {
    const cli = resolvePlaywrightCli()
    expect(path.basename(cli)).toBe('cli.js')
    expect(fs.existsSync(cli)).toBe(true)
    // Same package root as the library the runner imports, so the browsers it
    // downloads are the ones the run will launch.
    const root = path.dirname(cli)
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('installBrowsers', () => {
  it('forwards its arguments to `playwright install` and reports the exit code', async () => {
    // `--dry-run` exercises the spawn path without downloading a browser.
    const code = await installBrowsers(['chromium', '--dry-run'], { stdio: 'ignore' })
    expect(code).toBe(0)
  })

  it('reports a non-zero exit code from the installer', async () => {
    const code = await installBrowsers(['no-such-browser'], { stdio: 'ignore' })
    expect(code).not.toBe(0)
  })
})

describe('isMissingPlaywrightError', () => {
  it('recognizes an unresolvable playwright import', () => {
    const err = Object.assign(new Error("Cannot find package 'playwright' imported from /app/runner.js"), {
      code: 'ERR_MODULE_NOT_FOUND',
    })
    expect(isMissingPlaywrightError(err)).toBe(true)
  })

  it('ignores an unresolvable import of some other package', () => {
    const err = Object.assign(new Error("Cannot find package 'jiti' imported from /app/loader.js"), {
      code: 'ERR_MODULE_NOT_FOUND',
    })
    expect(isMissingPlaywrightError(err)).toBe(false)
  })

  it('ignores an error without a module-resolution code', () => {
    expect(isMissingPlaywrightError(new Error("Cannot find package 'playwright'"))).toBe(false)
    expect(isMissingPlaywrightError(null)).toBe(false)
  })
})

describe('isMissingBrowserError', () => {
  it("recognizes playwright's missing-executable error", () => {
    const err = new Error(
      "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome"
    )
    expect(isMissingBrowserError(err)).toBe(true)
  })

  it('ignores an unrelated launch failure', () => {
    expect(isMissingBrowserError(new Error('browserType.launch: Timeout 30000ms exceeded'))).toBe(false)
    expect(isMissingBrowserError(null)).toBe(false)
  })
})

describe('setup messages', () => {
  it('name the command that fixes each failure', () => {
    expect(MISSING_PLAYWRIGHT_MESSAGE).toContain('pnpm add -D playwright')
    expect(MISSING_PLAYWRIGHT_MESSAGE).toContain('scenetest install')
    expect(MISSING_BROWSER_MESSAGE).toContain('scenetest install')
  })
})
