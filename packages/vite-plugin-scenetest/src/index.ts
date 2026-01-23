import type { Plugin, ViteDevServer } from 'vite'
import { stripScenetest } from './strip.js'
import { devPanelScript } from './dev-panel.generated.js'
import { transformAssertions } from './transform.js'
import {
  registerAssertions,
  removeAssertionsForFile,
  clearRegistry,
  VIRTUAL_MODULE_ID,
  RESOLVED_VIRTUAL_MODULE_ID,
  generateVirtualModuleCode,
} from './virtual-module.js'
import { clearConfigCache, isConfigFile } from './config.js'
import { createScenetestMiddleware } from './middleware.js'

export interface ScenetestPluginOptions {
  /**
   * Whether to strip scenetest code in this build.
   * Defaults to true in production builds, false otherwise.
   */
  strip?: boolean

  /**
   * Show the dev panel UI for viewing assertions in real-time.
   * Defaults to true in development mode.
   */
  devPanel?: boolean
}

/**
 * Vite plugin for Scenetest
 *
 * In development/test mode: transforms assertion() calls and serves serverFn via middleware
 * In production mode: strips all scenetest imports and function calls via AST transform
 */
export function scenetest(options: ScenetestPluginOptions = {}): Plugin {
  let shouldStrip = false
  let showDevPanel = false
  let mode = 'development'
  let root = process.cwd()
  let server: ViteDevServer | undefined

  return {
    name: 'vite-plugin-scenetest',

    config(_config, env) {
      mode = env.mode
      // Default: strip in production, keep in dev/test
      shouldStrip = options.strip ?? env.mode === 'production'
      // Default: show dev panel in development mode
      showDevPanel = options.devPanel ?? env.mode === 'development'
    },

    configResolved(config) {
      root = config.root
    },

    configureServer(devServer) {
      server = devServer

      // Install the scenetest middleware for handling RPC requests
      server.middlewares.use(createScenetestMiddleware(server, root))
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
      return null
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generateVirtualModuleCode()
      }
      return null
    },

    transform(code, id) {
      // Only process JS/TS files
      if (!/\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$/.test(id)) {
        return null
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null
      }

      // Quick check - skip if no scenetest
      if (!code.includes('scenetest')) {
        return null
      }

      if (shouldStrip) {
        // Production mode: strip scenetest code via AST transform
        const result = stripScenetest(code, {
          filename: id,
          sourceMap: true,
        })

        if (!result) {
          return null
        }

        return {
          code: result.code,
          map: result.map,
        }
      }

      // Dev mode: transform assertion() calls
      const transformResult = transformAssertions(code, {
        filename: id,
        sourceMap: true,
      })

      if (transformResult) {
        // Register extracted assertions for the virtual module
        registerAssertions(transformResult.extractedAssertions)

        // Invalidate the virtual module so it regenerates with new assertions
        if (server) {
          const virtualMod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID)
          if (virtualMod) {
            server.moduleGraph.invalidateModule(virtualMod)
          }
        }

        return {
          code: transformResult.code,
          map: transformResult.map,
        }
      }

      return null
    },

    transformIndexHtml(html) {
      if (!showDevPanel) {
        return html
      }

      // Inject the dev panel script before </body>
      const script = `<script>${devPanelScript}</script>`
      return html.replace('</body>', `${script}</body>`)
    },

    buildStart() {
      // Clear registries on build start
      clearRegistry()
      clearConfigCache()

      if (shouldStrip) {
        console.log('[vite-plugin-scenetest] Production build - stripping scenetest code')
      } else {
        console.log(`[vite-plugin-scenetest] ${mode} mode - scenetest assertions active`)
        if (showDevPanel) {
          console.log('[vite-plugin-scenetest] Dev panel enabled - open your app to see assertions')
        }
      }
    },

    handleHotUpdate({ file }) {
      // Clear config cache if config file changed
      if (isConfigFile(file, root)) {
        clearConfigCache()
        console.log('[vite-plugin-scenetest] Config file changed - reloading')
      }

      // Remove assertions from the file being updated (they'll be re-registered on transform)
      removeAssertionsForFile(file)
    },
  }
}

// Re-export strip function for testing
export { stripScenetest } from './strip.js'

// Re-export config helper for user config files
export { defineScenetestConfig } from './config.js'

// Re-export server-side should/failed for use in scenetest.config.ts
export { should, failed } from './middleware.js'

export default scenetest
