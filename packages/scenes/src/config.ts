import path from 'path'
import fs from 'fs'
import { glob } from 'glob'
import type { ScenetestConfig, TeamConfig } from './types.js'
import { importFile } from './loader.js'

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
  warnAfter: 500,
  reportDir: './scenetest-reports',
  reportFormat: 'html',
}

/**
 * Config file names to search for (in order of preference)
 */
const CONFIG_FILES = [
  'scenetest.config.ts',
  'scenetest.config.js',
  'scenetest.config.mjs',
  'scenetest/config.ts',
  'scenetest/config.js',
  'scenetest/config.mjs',
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
 * Discover actor team files relative to the config file directory.
 *
 * Looks for:
 * 1. `actors.ts` (single file exporting an array of teams)
 * 2. `actors/*.ts` (directory with one file per team)
 */
async function discoverTeams(configDir: string): Promise<TeamConfig[]> {
  // Check for single actors file first
  const singleFiles = ['actors.ts', 'actors.js', 'actors.mjs']
  for (const name of singleFiles) {
    const filepath = path.join(configDir, name)
    if (fs.existsSync(filepath)) {
      const module = await importFile(filepath)
      const exported = module.default
      if (Array.isArray(exported)) {
        return exported as TeamConfig[]
      }
      // Single team exported as object
      return [exported as TeamConfig]
    }
  }

  // Check for actors directory
  const actorsDir = path.join(configDir, 'actors')
  if (fs.existsSync(actorsDir) && fs.statSync(actorsDir).isDirectory()) {
    const files = await glob('*.{ts,js,mjs}', {
      cwd: actorsDir,
      absolute: true,
    })

    if (files.length === 0) {
      throw new Error(`actors/ directory found at ${actorsDir} but contains no .ts/.js files`)
    }

    const teams: TeamConfig[] = []
    for (const file of files.sort()) {
      const module = await importFile(file)
      teams.push(module.default as TeamConfig)
    }
    return teams
  }

  throw new Error(
    `No actor files found. Create actors.ts (exporting an array of teams) or actors/*.ts (one file per team) next to your config file at ${configDir}`
  )
}

/**
 * Loaded config with resolved teams
 */
export interface LoadedConfig {
  config: ScenetestConfig
  teams: TeamConfig[]
}

/**
 * Load and validate the config file, and discover actor teams
 */
export async function loadConfig(configPath?: string): Promise<LoadedConfig> {
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
  const module = await importFile(filepath)
  const config = module.default as ScenetestConfig

  // Validate required fields
  if (!config.baseUrl) {
    throw new Error('Config missing required field: baseUrl')
  }

  // Merge with defaults
  const resolved = {
    ...defaults,
    ...config,
  } as ScenetestConfig

  // Discover actor teams relative to config file
  const configDir = path.dirname(path.resolve(filepath))
  const teams = await discoverTeams(configDir)

  if (teams.length === 0) {
    throw new Error('No actor teams found. Each actor file must export a team (Record<string, ActorConfig>).')
  }

  return { config: resolved, teams }
}

/**
 * Helper to define config with type checking
 */
export function defineConfig(config: ScenetestConfig): ScenetestConfig {
  return config
}
