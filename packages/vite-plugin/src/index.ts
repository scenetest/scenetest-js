import type { Plugin, ViteDevServer } from 'vite'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { stripScenetest } from './strip.js'

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
import type { Connect } from 'vite'

// Virtual module IDs for injected dev panel scripts
const OBSERVER_VIRTUAL_ID = '/@scenetest/observer.js'
const RECORDER_VIRTUAL_ID = '/@scenetest/recorder.js'

// The actual packages these resolve to
const OBSERVER_MODULE = '@scenetest/checks-panel/auto'
const RECORDER_MODULE = '@scenetest/scenes-panel/auto'

function resolveFromPlugin(specifier: string): string | null {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return null
  }
}

/**
 * Default CSP directives for dev mode.
 * - 'unsafe-inline' is required for the dev panel's injected script and styles
 * - 'unsafe-eval' is needed for Vite's HMR in dev mode
 * - ws: and wss: are needed for Vite's WebSocket HMR connection
 */
const DEFAULT_CSP_DIRECTIVES: CspDirectives = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'font-src': "'self' data:",
  'connect-src': "'self' ws: wss:",
  'object-src': "'none'",
  'base-uri': "'self'",
  'frame-ancestors': "'self'",
}

/**
 * Create CSP middleware that adds Content-Security-Policy headers.
 * Only applies to HTML responses to avoid interfering with other assets.
 */
function createCspMiddleware(directives: CspDirectives): Connect.NextHandleFunction {
  const policy = Object.entries(directives)
    .map(([key, value]) => `${key} ${value}`)
    .join('; ')

  return (req, res, next) => {
    // Only apply CSP to HTML pages (not assets, API calls, etc.)
    const accept = req.headers.accept || ''
    if (accept.includes('text/html')) {
      res.setHeader('Content-Security-Policy', policy)
    }
    next()
  }
}

// Get git commit hash at plugin load time
function getGitHash(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// Get version from own package.json (all packages share the same version)
const __dirname = dirname(fileURLToPath(import.meta.url))
function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
    return pkg.version || 'dev'
  } catch {
    return 'dev'
  }
}

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

  /**
   * Demo mode - show dev panel even in production builds.
   * When true, scenetest code is NOT stripped and the panel is shown.
   * Useful for demos and documentation sites.
   */
  demo?: boolean

  /**
   * Enable the scene recorder panel.
   * Shows a left sidebar that captures user interactions as DSL lines.
   * Defaults to false — opt-in via scenetest({ recorder: true }).
   */
  recorder?: boolean

  /**
   * Content Security Policy configuration for dev mode.
   * Adds CSP headers to protect against XSS and other injection attacks.
   * Defaults to disabled — opt in with `csp: true` or `csp: { enabled: true }`.
   * The default policy is restrictive ('self' + 'unsafe-inline') and will block
   * external resources like Google Fonts, third-party APIs, etc.
   */
  csp?:
    | boolean
    | {
        /**
         * Whether to enable CSP headers.
         * Defaults to false.
         */
        enabled?: boolean

        /**
         * Custom CSP policy directives to override defaults.
         * Default policy allows 'self' and 'unsafe-inline' for scripts/styles
         * (required for dev panel), blocks plugins, and restricts base URI.
         */
        directives?: Partial<CspDirectives>
      }
}

/**
 * CSP directive configuration
 */
export interface CspDirectives {
  'default-src': string
  'script-src': string
  'style-src': string
  'img-src': string
  'font-src': string
  'connect-src': string
  'object-src': string
  'base-uri': string
  'frame-ancestors': string
}

/**
 * Vite plugin for Scenetest
 *
 * In development/test mode: transforms assertion() calls and serves serverFn via middleware
 * In production mode: strips all scenetest imports and function calls via AST transform
 * In demo mode: keeps scenetest code and shows the panel even in production
 */
export function scenetest(options: ScenetestPluginOptions = {}): Plugin {
  let shouldStrip = false
  let showDevPanel = false
  let showRecorder = false
  let cspEnabled = false
  let cspDirectives: CspDirectives = DEFAULT_CSP_DIRECTIVES
  let mode = 'development'
  let root = process.cwd()
  let server: ViteDevServer | undefined

  return {
    name: 'vite-plugin-scenetest',

    config(_config, env) {
      mode = env.mode
      // Demo mode overrides: never strip, always show panel
      if (options.demo) {
        shouldStrip = false
        showDevPanel = true
      } else {
        // Default: strip in production, keep in dev/test
        shouldStrip = options.strip ?? env.mode === 'production'
        // Default: show dev panel in development mode
        showDevPanel = options.devPanel ?? env.mode === 'development'
      }

      // Recorder: opt-in, only in development
      showRecorder = options.recorder === true && !shouldStrip

      // CSP configuration: opt-in to avoid breaking external resources
      if (typeof options.csp === 'boolean') {
        cspEnabled = options.csp
      } else if (typeof options.csp === 'object') {
        cspEnabled = options.csp.enabled ?? false
        if (options.csp.directives) {
          cspDirectives = { ...DEFAULT_CSP_DIRECTIVES, ...options.csp.directives }
        }
      } else {
        cspEnabled = false
      }

    },

    configResolved(config) {
      root = config.root
    },

    configureServer(devServer) {
      server = devServer

      // Install CSP middleware if enabled (before other middleware)
      if (cspEnabled) {
        server.middlewares.use(createCspMiddleware(cspDirectives))
      }

      // Install the scenetest middleware for handling RPC requests
      server.middlewares.use(createScenetestMiddleware(server, root))
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
      // Virtual modules for dev panel injection
      if (id === OBSERVER_VIRTUAL_ID || id === RECORDER_VIRTUAL_ID) {
        return id
      }
      // Resolve panel packages for the consumer — handles pnpm strict hoisting
      // where transitive deps aren't directly accessible from the project root
      if (id === OBSERVER_MODULE || id === RECORDER_MODULE) {
        return resolveFromPlugin(id)
      }
      // Resolve @scenetest/checks/runtime for serverCheck() transform injection
      // (the transform injects this import, but the consumer may not have
      // @scenetest/checks as a direct dependency under pnpm strict hoisting)
      if (id === '@scenetest/checks/runtime') {
        return resolveFromPlugin(id)
      }
      return null
    },

    load(id) {
      // Virtual modules return { code, moduleType } so Vite 8's Rolldown
      // bundler knows these are JS modules (it infers type from file extension,
      // and virtual module IDs may not have one). This is backward-compatible
      // with Vite 5/6/7 which ignore the moduleType property.
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return { code: generateVirtualModuleCode(), moduleType: 'js' }
      }
      // Virtual module that bootstraps the observer panel
      if (id === OBSERVER_VIRTUAL_ID) {
        const gitHash = getGitHash()
        const version = getVersion()
        return {
          code: `window.__SCENETEST_GIT_HASH__ = ${JSON.stringify(gitHash)};
window.__SCENETEST_VERSION__ = ${JSON.stringify(version)};
import '${OBSERVER_MODULE}';`,
          moduleType: 'js',
        }
      }
      // Virtual module that bootstraps the recorder panel
      if (id === RECORDER_VIRTUAL_ID) {
        return { code: `import '${RECORDER_MODULE}';`, moduleType: 'js' }
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
      if (!showDevPanel && !showRecorder) {
        return html
      }

      let scripts = ''

      if (showDevPanel) {
        scripts += `<script type="module" src="${OBSERVER_VIRTUAL_ID}"></script>`
      }

      if (showRecorder) {
        scripts += `<script type="module" src="${RECORDER_VIRTUAL_ID}"></script>`
      }

      return html.replace('</body>', `${scripts}</body>`)
    },

    buildStart() {
      // Clear registries on build start
      clearRegistry()
      clearConfigCache()

      if (options.demo) {
        console.log('[vite-plugin-scenetest] Demo mode - scenetest panel enabled in production')
      } else if (shouldStrip) {
        console.log('[vite-plugin-scenetest] Production build - stripping scenetest code')
      } else {
        console.log(`[vite-plugin-scenetest] ${mode} mode - scenetest assertions active`)
        if (showDevPanel) {
          console.log('[vite-plugin-scenetest] Dev panel enabled - open your app to see assertions')
          console.log('[vite-plugin-scenetest] Live dashboard available at /__scenetest/dashboard')
        }
        if (showRecorder) {
          console.log('[vite-plugin-scenetest] Scene recorder enabled - record interactions as DSL')
        }
        if (cspEnabled) {
          console.log('[vite-plugin-scenetest] CSP headers enabled for dev server')
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

// Re-export server-side should/failed for use in scenetest/config.ts
export { should, failed } from './middleware.js'

export default scenetest
