import path from 'path'
import fs from 'fs'
import { glob } from 'glob'
import type { ScenetestConfig, TeamConfig, TeamDef, TeamMeta, ResolvedTeam } from './types.js'
import { importFile } from './loader.js'

/**
 * Default config values
 */
const defaults: Partial<ScenetestConfig> = {
  browser: 'chromium',
  headed: false,
  slowMo: 0,
  timeout: 30000,
  actionTimeout: 5000,
  warnAfter: 500,
  reportDir: './scenetest/.reports',
  reportFormat: 'json',
}

/**
 * Config file names to search for (in order of preference)
 */
const CONFIG_FILES = [
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
 * Check whether a value looks like a TeamDef (has `actors` key)
 * vs a plain TeamConfig (Record<string, ActorConfig>).
 */
function isTeamDef(value: unknown): value is TeamDef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'actors' in value &&
    typeof (value as Record<string, unknown>).actors === 'object'
  )
}

/**
 * Normalize a raw export (TeamConfig or TeamDef) into a ResolvedTeam.
 */
function resolveTeam(raw: TeamConfig | TeamDef): ResolvedTeam {
  if (isTeamDef(raw)) {
    const meta: TeamMeta = {}
    if (raw.name !== undefined) meta.name = raw.name
    if (raw.tags !== undefined) meta.tags = raw.tags
    return { actors: raw.actors, meta }
  }
  // Plain Record<string, ActorConfig> — no metadata
  return { actors: raw, meta: {} }
}

/**
 * Discover actor team files from scenetest/actors/ directory.
 *
 * Each .ts/.js file in the directory exports either:
 * - A single TeamConfig or TeamDef
 * - An array of TeamConfig[] or TeamDef[]
 */
async function discoverTeams(configDir: string): Promise<ResolvedTeam[]> {
  const actorsDir = path.join(configDir, 'actors')

  if (!fs.existsSync(actorsDir) || !fs.statSync(actorsDir).isDirectory()) {
    throw new Error(
      `No actors/ directory found at ${actorsDir}. Create scenetest/actors/ with one .ts file per team.`
    )
  }

  const files = await glob('*.{ts,js,mjs}', {
    cwd: actorsDir,
    absolute: true,
  })

  if (files.length === 0) {
    throw new Error(`actors/ directory found at ${actorsDir} but contains no .ts/.js files`)
  }

  const teams: ResolvedTeam[] = []
  for (const file of files.sort()) {
    const module = await importFile(file)
    const exported = module.default
    if (Array.isArray(exported)) {
      // File exports an array of teams
      for (const item of exported) {
        teams.push(resolveTeam(item as TeamConfig | TeamDef))
      }
    } else {
      // File exports a single team
      teams.push(resolveTeam(exported as TeamConfig | TeamDef))
    }
  }
  return teams
}

/**
 * Loaded config with resolved teams
 */
export interface LoadedConfig {
  config: ScenetestConfig
  teams: ResolvedTeam[]
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
    throw new Error('No actor teams found. Each actor file must export a team (Record<string, ActorConfig> or defineTeam({...})).')
  }

  return { config: resolved, teams }
}

/**
 * Helper to define config with type checking
 */
export function defineConfig(config: ScenetestConfig): ScenetestConfig {
  return config
}

/**
 * Helper to define a team with type checking.
 *
 * @example
 * ```ts
 * // scenetest/actors/french.ts
 * import { defineTeam } from '@scenetest/scenes'
 *
 * export default defineTeam({
 *   name: 'French Content',
 *   tags: { locale: 'fr', region: 'europe' },
 *   actors: {
 *     user:  { key: 'fr-user-1', username: 'pierre', email: 'pierre@test.com' },
 *     admin: { key: 'fr-admin-1', username: 'marie', email: 'marie@admin.com' },
 *   },
 * })
 * ```
 */
export function defineTeam(team: TeamDef): TeamDef {
  return team
}

/**
 * Restrict a team pool to a single team by `meta.name`.
 * Throws with a helpful list of available team names on no match.
 */
export function filterTeamsByName(teams: ResolvedTeam[], name: string): ResolvedTeam[] {
  const matched = teams.filter(t => t.meta.name === name)
  if (matched.length === 0) {
    const available = teams.map(t => t.meta.name ?? '(unnamed)').join(', ')
    throw new Error(`--team "${name}" not found. Available teams: ${available}`)
  }
  return matched
}
