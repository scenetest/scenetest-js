import type { ServerContext } from '@scenetest/core'
import { existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Scenetest configuration object
 */
export interface ScenetestConfig {
  /**
   * Server functions available in serverFn via the `server` parameter.
   * These functions can access databases, APIs, or any server-side resources.
   */
  serverFunctions?: Partial<ServerContext>
}

/**
 * Helper function for defining scenetest config with type safety
 */
export function defineScenetestConfig(config: ScenetestConfig): ScenetestConfig {
  return config
}

/**
 * Cached config to avoid re-loading on every request
 */
let cachedConfig: ScenetestConfig | null = null
let cachedConfigPath: string | null = null

/**
 * Clear cached config (for HMR)
 */
export function clearConfigCache(): void {
  cachedConfig = null
  cachedConfigPath = null
}

/**
 * Find the scenetest config file path
 */
export function findConfigPath(root: string): string | null {
  const extensions = ['ts', 'js', 'mjs']

  for (const ext of extensions) {
    const configPath = resolve(root, `scenetest.config.${ext}`)
    if (existsSync(configPath)) {
      return configPath
    }
  }

  return null
}

/**
 * Load the scenetest config using Vite's SSR module loader.
 * This must be called from the server context with access to ViteDevServer.
 */
export async function loadConfig(
  root: string,
  ssrLoadModule: (id: string) => Promise<Record<string, unknown>>
): Promise<ScenetestConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig
  }

  const configPath = findConfigPath(root)
  if (!configPath) {
    cachedConfig = {}
    return cachedConfig
  }

  cachedConfigPath = configPath

  try {
    const module = await ssrLoadModule(configPath)
    cachedConfig = (module.default as ScenetestConfig) || {}
    return cachedConfig
  } catch (err) {
    console.warn(`[vite-plugin-scenetest] Failed to load config from ${configPath}:`, err)
    cachedConfig = {}
    return cachedConfig
  }
}

/**
 * Check if a file path is the scenetest config file
 */
export function isConfigFile(file: string, root: string): boolean {
  if (!cachedConfigPath) {
    // Check if file matches any potential config path
    const configPath = findConfigPath(root)
    return configPath === file
  }
  return cachedConfigPath === file
}
