import type { Plugin } from 'vite'

export interface ScenetestPluginOptions {
  /**
   * Whether to strip scenetest code in this build.
   * Defaults to false (runtime detection handles it).
   * Set to true to enable build-time stripping (requires AST parser - not yet implemented).
   */
  strip?: boolean
}

/**
 * Vite plugin for Scenetest
 *
 * Currently this plugin is minimal - it just ensures proper configuration.
 * The scenetest runtime functions (pass/fail) are no-ops when window.__scenetest_report
 * is not defined, so they're safe to include in production builds.
 *
 * TODO: Add AST-based code stripping for production builds to reduce bundle size.
 */
export function scenetest(_options: ScenetestPluginOptions = {}): Plugin {
  return {
    name: 'vite-plugin-scenetest',

    config(_config, { mode }) {
      // Log mode for debugging
      if (mode === 'production') {
        console.log('[vite-plugin-scenetest] Production build - scenetest calls will be no-ops at runtime')
      } else {
        console.log(`[vite-plugin-scenetest] ${mode} mode - scenetest assertions active`)
      }
    },

    // For now, we don't transform anything.
    // The runtime handles detection of window.__scenetest_report.
    // In the future, we can add AST-based stripping for smaller production bundles.
  }
}

export default scenetest
