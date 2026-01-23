import { pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs'
import type { ScenetestConfig } from './types.js'

/**
 * Default config values
 */
const defaults: Partial<ScenetestConfig> = {
  scenes: './scenes',
  browser: 'chromium',
  headed: false,
  slowMo: 0,
  timeout: 30000,
  actionTimeout: 5000,
  reportDir: './scenetest-reports',
  reportFormat: 'html',
}

/**
 * Config file names to search for (in order of preference)
 */
const CONFIG_FILES = [
  'scenetest-cli.config.ts',
  'scenetest-cli.config.js',
  'scenetest-cli.config.mjs',
  'scenes.config.ts',
  'scenes.config.js',
  'scenes.config.mjs',
]

/**
 * Find the config file in the current directory
 */
export function findConfigFile(cwd = process.cwd()): string | null {
  for (const name of CONFIG_FILES) {
    const filepath = path.join(cwd, name)
    if (fs.existsSync(filepath)) {
      return filepath
    }
  }
  return null
}

/**
 * Load and validate the config file
 */
export async function loadConfig(configPath?: string): Promise<ScenetestConfig> {
  const filepath = configPath || findConfigFile()

  if (!filepath) {
    throw new Error(
      `No config file found. Create one of: ${CONFIG_FILES.join(', ')}`
    )
  }

  if (!fs.existsSync(filepath)) {
    throw new Error(`Config file not found: ${filepath}`)
  }

  // Dynamic import
  const module = await import(pathToFileURL(filepath).href)
  const config = module.default as ScenetestConfig

  // Validate required fields
  if (!config.baseUrl) {
    throw new Error('Config missing required field: baseUrl')
  }

  if (!config.casts || config.casts.length === 0) {
    throw new Error('Config missing required field: casts (must have at least one cast)')
  }

  // Merge with defaults
  return {
    ...defaults,
    ...config,
  } as ScenetestConfig
}

/**
 * Helper to define config with type checking
 */
export function defineConfig(config: ScenetestConfig): ScenetestConfig {
  return config
}
