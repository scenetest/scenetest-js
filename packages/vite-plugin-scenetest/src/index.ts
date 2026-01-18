import type { Plugin } from 'vite'
import { stripScenetest } from './strip.js'
import { devPanelScript } from './dev-panel.js'

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
 * In development/test mode: leaves code as-is (assertions report to test runner)
 * In production mode: strips all scenetest imports and function calls via AST transform
 */
export function scenetest(options: ScenetestPluginOptions = {}): Plugin {
  let shouldStrip = false
  let showDevPanel = false
  let mode = 'development'

  return {
    name: 'vite-plugin-scenetest',

    config(_config, env) {
      mode = env.mode
      // Default: strip in production, keep in dev/test
      shouldStrip = options.strip ?? env.mode === 'production'
      // Default: show dev panel in development (not in test mode - Playwright handles that)
      showDevPanel = options.devPanel ?? (env.mode === 'development' && !process.env.PLAYWRIGHT_TEST)
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

      if (!shouldStrip) {
        // In dev/test mode, leave code as-is
        // The runtime checks for window.__scenetest_report
        return null
      }

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
      if (shouldStrip) {
        console.log('[vite-plugin-scenetest] Production build - stripping scenetest code')
      } else {
        console.log(`[vite-plugin-scenetest] ${mode} mode - scenetest assertions active`)
        if (showDevPanel) {
          console.log('[vite-plugin-scenetest] Dev panel enabled - open your app to see assertions')
        }
      }
    },
  }
}

// Re-export strip function for testing
export { stripScenetest } from './strip.js'

export default scenetest
