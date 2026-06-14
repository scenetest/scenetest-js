import type { Connect, ViteDevServer } from 'vite'
import type {
  AssertionRpcPayload,
  AssertionRpcResponse,
  AssertionResult,
  ServerCheckHelpers,
  ServerContext,
} from '@scenetest/checks'
import { createReceiverApp, toNodeHandler, JsonlSink, type Sink } from '@scenetest/receiver'
import { AsyncLocalStorage } from 'async_hooks'
import { spawn, type ChildProcess } from 'child_process'
import type { ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'node:url'
import { VIRTUAL_MODULE_ID } from './virtual-module.js'
import { loadConfig } from './config.js'
import { EventHub } from './event-hub.js'
import { generateAnalyzeAppHtml } from './analyze-app.js'

/**
 * Map of /__scenetest/vendor/<name> → bare specifier in the plugin's own
 * node_modules. The middleware reads each module's ESM build off disk and
 * serves it so the analyze app can `import` Preact / htm without a build
 * step or a CDN. The HTML page contains a corresponding <script type="importmap">
 * so that bare specifiers inside these modules (e.g. `from "preact"` inside
 * preact/hooks) resolve to the vendor URL.
 */
// Map of /__scenetest/vendor/<name> → bare specifier whose ESM build we
// serve. We resolve via `import.meta.resolve` from the plugin's own module
// context so each package's `exports` map (with the `import` condition)
// gives us a real ESM file path inside the plugin's node_modules.
const VENDOR_MODULES: Record<string, string> = {
  'preact.js': 'preact',
  'preact-hooks.js': 'preact/hooks',
  'htm.js': 'htm',
}

/**
 * Resolve a bare specifier to a file path on disk, picking the ESM build
 * the package advertises under its `import` condition.
 *
 * We don't use `import.meta.resolve` because vitest's module runner doesn't
 * implement it. Instead we walk the package's `exports` manifest manually:
 *
 *   1. require.resolve('<pkg>/package.json') — locate the package root.
 *   2. Look up `exports[<subpath>]`, prefer the `import` condition.
 *   3. Fall back to `module` then `main` for older packages.
 *
 * Returns an absolute path or null if the spec can't be resolved.
 */
const vendorRequire = createRequire(import.meta.url)

/**
 * The dev console shell, built by Vite to `packages/vite-plugin/dist-app`
 * (see `app/vite.config.ts`) and served as static files at
 * `/__scenetest/dashboard`. Resolved relative to this module so it works both
 * from `dist/` (published) and `src/` (vitest) — the relative path is the same.
 */
const DEFAULT_APP_DIR = fileURLToPath(new URL('../dist-app', import.meta.url))

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Serve one file from the built app dir, constrained to it (no traversal).
 * Returns false if the file isn't there, so the caller can fall through.
 */
function serveAppFile(appDir: string, relPath: string, res: ServerResponse): boolean {
  const target = path.resolve(appDir, relPath)
  if (target !== appDir && !target.startsWith(appDir + path.sep)) {
    res.statusCode = 403
    res.end('// Forbidden')
    return true
  }
  let body: Buffer
  try {
    body = fs.readFileSync(target)
  } catch {
    return false
  }
  res.statusCode = 200
  res.setHeader('Content-Type', MIME_BY_EXT[path.extname(target)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(body)
  return true
}

function resolveVendor(specifier: string): string | null {
  // Split "preact/hooks" → ["preact", "./hooks"], "preact" → ["preact", "."]
  const slash = specifier.indexOf('/')
  const pkg = slash === -1 ? specifier : specifier.slice(0, slash)
  const sub = slash === -1 ? '.' : '.' + specifier.slice(slash)

  // Find the package root. We can't always resolve `<pkg>/package.json`
  // directly — some packages (e.g. htm) don't export it. Resolving the
  // bare specifier returns *some* file inside the package; walk up from
  // there until we find a package.json whose `name` matches.
  let resolvedFile: string
  try {
    resolvedFile = vendorRequire.resolve(pkg)
  } catch {
    return null
  }

  const pkgRoot = findPackageRoot(resolvedFile, pkg)
  if (!pkgRoot) return null

  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8'))
  } catch {
    return null
  }

  const file = pickExport(manifest, sub)
  if (!file) return null
  return path.resolve(pkgRoot, file)
}

function findPackageRoot(startFile: string, expectedName: string): string | null {
  let dir = path.dirname(startFile)
  // Bound the walk to avoid runaway loops on broken filesystems.
  for (let i = 0; i < 30; i++) {
    const pj = path.join(dir, 'package.json')
    if (fs.existsSync(pj)) {
      try {
        const m = JSON.parse(fs.readFileSync(pj, 'utf-8')) as { name?: string }
        if (m.name === expectedName) return dir
      } catch {
        // ignore malformed package.json and keep walking
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * Pick the file for a given subpath out of a package.json. Honors the
 * `exports` field with conditional resolution (prefer `import`, fall back
 * to `browser`/`default`), then `module`, then `main`.
 */
function pickExport(manifest: Record<string, unknown>, sub: string): string | null {
  const exports = manifest.exports as unknown
  if (exports && typeof exports === 'object') {
    const entry = (exports as Record<string, unknown>)[sub]
    const resolved = pickCondition(entry)
    if (resolved) return resolved
  }
  // No exports for this subpath — fall back to module/main only when sub === '.'
  if (sub === '.') {
    if (typeof manifest.module === 'string') return manifest.module
    if (typeof manifest.main === 'string') return manifest.main
  }
  return null
}

function pickCondition(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry !== 'object') return null
  const obj = entry as Record<string, unknown>
  // Conditional resolution order matches what most ESM consumers do.
  for (const key of ['import', 'browser', 'default', 'module']) {
    const v = obj[key]
    const resolved = pickCondition(v)
    if (resolved) return resolved
  }
  return null
}


/**
 * AsyncLocalStorage for collecting assertion results within a serverFn execution
 */
const assertionStorage = new AsyncLocalStorage<AssertionResult[]>()

/**
 * Server-side should() function that collects results in AsyncLocalStorage
 */
export function should(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const results = assertionStorage.getStore()
  if (results) {
    results.push({
      type: condition ? 'pass' : 'fail',
      description,
      result: condition,
      timestamp: Date.now(),
      context,
    })
  }
}

/**
 * Server-side failed() function - past-tense failure marker
 */
export function failed(description: string, context?: Record<string, unknown>): void {
  const results = assertionStorage.getStore()
  if (results) {
    results.push({
      type: 'fail',
      description,
      result: false,
      timestamp: Date.now(),
      context,
    })
  }
}

/**
 * Loads and evaluates a module through the dev server's plugin pipeline
 * (so the scenetest plugin's resolveId/load hooks apply).
 */
type ServerModuleLoader = (id: string) => Promise<Record<string, unknown>>

/**
 * Default per-serverCheck() execution timeout (ms). Overridable via the
 * middleware's `serverCheckTimeout` option (threaded from the plugin option
 * of the same name).
 */
const DEFAULT_SERVER_CHECK_TIMEOUT_MS = 5000

/**
 * Build the module loader used to evaluate the virtual assertions module and
 * the user's scenetest config.
 *
 * On vite 6+ the Environments API is available: we create a server module
 * runner against the `ssr` environment (once per middleware instance, reused
 * across requests) and import through it. On vite 5 — or any vite build that
 * doesn't export `createServerModuleRunner` — we fall back to the legacy
 * `server.ssrLoadModule`, which the wide peer range still requires.
 */
async function createServerModuleLoader(server: ViteDevServer): Promise<ServerModuleLoader> {
  const ssrEnvironment = (server as { environments?: Record<string, unknown> }).environments?.ssr
  if (ssrEnvironment) {
    try {
      // Dynamic import + existence check: on vite 5 the import succeeds but
      // the export is absent, so we must not reference it statically.
      const vite = (await import('vite')) as unknown as {
        createServerModuleRunner?: (
          environment: unknown,
          options?: { hmr?: false }
        ) => { import: (id: string) => Promise<Record<string, unknown>> }
      }
      if (typeof vite.createServerModuleRunner === 'function') {
        const runner = vite.createServerModuleRunner(ssrEnvironment, { hmr: false })
        return (id) => runner.import(id)
      }
    } catch {
      // Fall through to ssrLoadModule
    }
  }
  return (id) => server.ssrLoadModule(id)
}

/**
 * Create the scenetest middleware for handling RPC requests.
 *
 * Observer and recorder modules are served via Vite's resolveId hook
 * (see index.ts) — not through middleware. This avoids fs.allow issues
 * with symlinked workspace packages.
 *
 * SECURITY NOTE: This middleware executes user-provided assertion code
 * from the virtual module in the dev server context with full Node.js
 * privileges. This is dev-only tooling - never expose to untrusted code
 * or networks. See README.md "Security Considerations" for details.
 */
export function createScenetestMiddleware(
  server: ViteDevServer,
  root: string,
  options: {
    reportsDir?: string
    jsonl?: boolean | string
    serverCheckTimeout?: number
    /** Override the built console dir (tests point this at a fixture). */
    appDir?: string
  } = {}
): Connect.NextHandleFunction {
  const eventHub = new EventHub()
  const appDir = options.appDir ?? DEFAULT_APP_DIR
  let activeReplay: ChildProcess | null = null
  let paused = false

  // Where to look for past JSON run reports. Defaults to the same path the
  // CLI writes to. Resolved against the consumer's project root.
  const reportsDir = path.resolve(root, options.reportsDir ?? 'scenetest/.reports')

  // Inbound CLI events go through the framework-agnostic receiver core
  // (@scenetest/receiver). The EventHub doubles as a Sink: write() relays
  // to the SSE clients, clear() resets the ring buffer on run:start.
  // Serving the SSE stream itself stays here — that's a dev-transport
  // concern, not the receiver's.
  const sinks: Sink[] = [eventHub]
  if (options.jsonl) {
    const jsonlPath =
      typeof options.jsonl === 'string'
        ? path.resolve(root, options.jsonl)
        : path.join(reportsDir, 'events.jsonl')
    sinks.push(new JsonlSink(jsonlPath))
  }
  const receiverHandler = toNodeHandler(createReceiverApp({ sinks }))

  // Per-serverCheck() execution deadline for /__scenetest/run.
  const serverCheckTimeoutMs = options.serverCheckTimeout ?? DEFAULT_SERVER_CHECK_TIMEOUT_MS

  // Module loader for serverFns + config: created lazily on the first RPC,
  // then reused for every request (the module runner keeps its own cache).
  let moduleLoaderPromise: Promise<ServerModuleLoader> | null = null
  const getModuleLoader = (): Promise<ServerModuleLoader> => {
    if (!moduleLoaderPromise) moduleLoaderPromise = createServerModuleLoader(server)
    return moduleLoaderPromise
  }

  return async (req, res, next) => {
    // ── Preact app shell (index + runner) ───────────────────
    // Same HTML for /__scenetest (index) and /__scenetest/runner
    // (current analyze view); the client routes on location.pathname.
    if (req.method === 'GET' && req.url) {
      const pathname = req.url.split('?')[0]
      if (
        pathname === '/__scenetest' ||
        pathname === '/__scenetest/' ||
        pathname === '/__scenetest/runner' ||
        pathname === '/__scenetest/runner/'
      ) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(generateAnalyzeAppHtml())
        return
      }
    }

    // ── Vendored ESM modules (preact, preact/hooks, htm) ────
    if (req.method === 'GET' && req.url?.startsWith('/__scenetest/vendor/')) {
      const name = req.url.slice('/__scenetest/vendor/'.length).split('?')[0]
      const target = VENDOR_MODULES[name]
      if (!target) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      const resolved = resolveVendor(target)
      if (!resolved) {
        res.statusCode = 500
        res.end('// Vendor module could not be resolved')
        return
      }
      try {
        const code = fs.readFileSync(resolved, 'utf-8')
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.end(code)
      } catch {
        res.statusCode = 500
        res.end('// Vendor module read failed')
      }
      return
    }

    // ── Dashboard: the built console shell, served as static files ──
    // The shell is a real Vite app (app/) built to dist-app; its asset URLs
    // are prefixed with the `/__scenetest/dashboard/` base. The page itself
    // (no sub-path) returns index.html; everything under it is an asset.
    if (req.method === 'GET' && req.url) {
      const pathname = req.url.split('?')[0]
      if (pathname === '/__scenetest/dashboard' || pathname === '/__scenetest/dashboard/') {
        if (serveAppFile(appDir, 'index.html', res)) return
        res.statusCode = 404
        res.end('// Dashboard not built — run the @scenetest/vite-plugin build')
        return
      }
      if (pathname.startsWith('/__scenetest/dashboard/')) {
        const rel = pathname.slice('/__scenetest/dashboard/'.length)
        if (serveAppFile(appDir, rel, res)) return
        res.statusCode = 404
        res.end('// Asset not found')
        return
      }
    }

    // ── List past run reports (JSON files in reportsDir) ────
    if (req.method === 'GET' && req.url === '/__scenetest/runs') {
      const runs = listRunReports(reportsDir)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ reportsDir, runs }))
      return
    }

    // ── Read a single run report by id (filename without .json) ──
    if (req.method === 'GET' && req.url?.startsWith('/__scenetest/runs/')) {
      const id = decodeURIComponent(req.url.slice('/__scenetest/runs/'.length))
      const result = readRunReport(reportsDir, id)
      if (!result) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Report not found' }))
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(result)
      return
    }

    // ── Read a window of source lines around a given line ──
    // GET /__scenetest/source?file=<abs path>&line=<n>&context=<n>
    if (req.method === 'GET' && req.url?.startsWith('/__scenetest/source')) {
      const url = new URL(req.url, 'http://x')
      const file = url.searchParams.get('file') || ''
      const line = parseInt(url.searchParams.get('line') || '1', 10)
      const ctx = Math.max(0, Math.min(200, parseInt(url.searchParams.get('context') || '20', 10)))
      const snippet = readSourceSnippet(root, file, line, ctx)
      res.statusCode = snippet ? 200 : 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(snippet ?? { error: 'File not readable or out of allowed root' }))
      return
    }

    // ── SSE event stream ────────────────────────────────────
    if (req.method === 'GET' && req.url === '/__scenetest/events') {
      eventHub.addClient(res)
      return
    }

    // ── Receive events from CLI runner ──────────────────────
    // Delegated to the receiver core: envelope-only validation (relay
    // semantics — event types newer than this plugin still fan out),
    // sink clear() on run:start, always 200 so old CLIs never break.
    if (req.method === 'POST' && req.url === '/__scenetest/events') {
      // The receiver app mounts at its own root; strip the prefix.
      req.url = '/events'
      await receiverHandler(req, res)
      return
    }

    // ── Replay endpoint ──────────────────────────────────────
    if (req.method === 'POST' && req.url === '/__scenetest/replay') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
      }

      let file: string | undefined
      let team: string | undefined
      try {
        const parsed = JSON.parse(body)
        file = parsed.file
        team = parsed.team
      } catch {
        // No body or invalid JSON — replay all
      }

      // If a replay is already running, kill it first
      if (activeReplay && activeReplay.exitCode === null) {
        activeReplay.kill()
      }

      // Build the CLI args
      const args: string[] = []
      if (team) {
        args.push('--team', team)
      }
      if (file) {
        // file is relative to scenetest/scenes/, resolve to full path
        args.push(path.resolve(root, 'scenetest', 'scenes', file))
      }

      // Spawn the scenetest CLI as a child process
      activeReplay = spawn('npx', ['scenetest', ...args], {
        cwd: root,
        stdio: 'ignore',
        shell: true,
      })

      activeReplay.on('error', () => {
        // Silently ignore spawn errors
      })

      paused = false
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // ── Stop running tests ──────────────────────────────────
    if (req.method === 'POST' && req.url === '/__scenetest/stop') {
      if (activeReplay && activeReplay.exitCode === null) {
        activeReplay.kill()
        activeReplay = null
      }
      paused = false
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // ── Pause / resume running tests ────────────────────────
    if (req.method === 'POST' && req.url === '/__scenetest/pause') {
      if (activeReplay && activeReplay.exitCode === null && activeReplay.pid) {
        if (paused) {
          process.kill(activeReplay.pid, 'SIGCONT')
          paused = false
        } else {
          process.kill(activeReplay.pid, 'SIGSTOP')
          paused = true
        }
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, paused }))
      return
    }

    // ── Assertion RPC (existing) ────────────────────────────
    if (req.method !== 'POST' || req.url !== '/__scenetest/run') {
      return next()
    }

    // Parse request body
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    let payload: AssertionRpcPayload
    try {
      payload = JSON.parse(body)
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, results: [], error: 'Invalid JSON payload' }))
      return
    }

    const { id, title, data } = payload

    const errorDetail = (err: unknown): string => (err instanceof Error ? err.message : String(err))

    const failResult = (description: string, context?: Record<string, unknown>): AssertionResult => ({
      type: 'fail',
      description,
      result: false,
      timestamp: Date.now(),
      context,
    })

    // Always answer HTTP 200 with a well-formed AssertionRpcResponse:
    // middleware-level failures surface as a normalized fail result so the
    // observer panel shows a failed check instead of an opaque 500.
    const respond = (response: AssertionRpcResponse): void => {
      let body: string
      try {
        body = JSON.stringify(response)
      } catch (err) {
        // Non-serializable assertion context (circular refs, BigInt, …)
        body = JSON.stringify({
          success: true,
          results: [failResult(`${title}: failed to serialize results`, { error: errorDetail(err) })],
        } satisfies AssertionRpcResponse)
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(body)
    }

    type ServerCheckFn = (
      server: ServerContext,
      data: unknown,
      helpers: ServerCheckHelpers
    ) => void | Promise<void>

    // Load the virtual module containing all serverFns
    let serverFn: ServerCheckFn | undefined
    try {
      const loadModule = await getModuleLoader()
      const virtualModule = await loadModule(VIRTUAL_MODULE_ID)
      const assertions = virtualModule.assertions as Record<string, ServerCheckFn>
      serverFn = assertions[id]
    } catch (err) {
      console.error('[vite-plugin-scenetest] Failed to load server assertions:', err)
      respond({
        success: true,
        results: [failResult(`${title}: failed to load server assertions`, { error: errorDetail(err) })],
      })
      return
    }

    if (!serverFn) {
      respond({
        success: true,
        results: [failResult(`${title}: no serverCheck() registered for id ${id}`, { id })],
      })
      return
    }
    const checkFn: ServerCheckFn = serverFn

    // Load config to get server resources. loadConfig() swallows load errors
    // (warn + empty config), so capture the underlying error here to surface
    // it as a failed check instead of silently running the serverFn against
    // an unexpectedly empty server context.
    let serverContext: ServerContext
    try {
      let configLoadFailed = false
      let configLoadError: unknown
      const loadModule = await getModuleLoader()
      const config = await loadConfig(root, async (configId) => {
        try {
          return await loadModule(configId)
        } catch (err) {
          configLoadFailed = true
          configLoadError = err
          throw err
        }
      })
      if (configLoadFailed) throw configLoadError
      serverContext = (config.server || {}) as ServerContext
    } catch (err) {
      respond({
        success: true,
        results: [failResult(`${title}: failed to load scenetest config`, { error: errorDetail(err) })],
      })
      return
    }

    // Execute the serverFn with AsyncLocalStorage for result collection.
    // Each invocation gets an AbortSignal that fires at the deadline; since
    // user code is free to ignore it, the invocation is also raced against
    // the same deadline so the HTTP response always returns.
    const results: AssertionResult[] = []
    const signal = AbortSignal.timeout(serverCheckTimeoutMs)
    let timedOut = false

    await assertionStorage.run(results, async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          resolve()
        }, serverCheckTimeoutMs)
      })
      // Pass the should/failed helpers (and the abort signal) to the serverFn
      const invocation = Promise.resolve().then(() => checkFn(serverContext, data, { should, failed, signal }))
      // A serverFn that rejects after the deadline must not crash the dev
      // server with an unhandled rejection.
      invocation.catch(() => {})
      try {
        await Promise.race([invocation, deadline])
      } catch (err) {
        results.push(failResult(`${title}: serverFn threw an error`, { error: errorDetail(err) }))
      } finally {
        clearTimeout(timer)
      }
    })

    if (timedOut) {
      results.push(failResult(`${title}: serverCheck timed out after ${serverCheckTimeoutMs}ms`))
    }

    respond({ success: true, results })
  }
}

// ─── Run report helpers (dev-only, local read) ──────────────────────

interface RunListEntry {
  id: string
  file: string
  size: number
  mtime: number
}

function listRunReports(dir: string): RunListEntry[] {
  if (!fs.existsSync(dir)) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: RunListEntry[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.json')) continue
    const full = path.join(dir, entry.name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    out.push({
      id: entry.name.replace(/\.json$/, ''),
      file: full,
      size: stat.size,
      mtime: stat.mtimeMs,
    })
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
}

function readRunReport(dir: string, id: string): string | null {
  // Defense in depth: only allow simple ids, no path traversal.
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null
  const full = path.join(dir, `${id}.json`)
  // Resolve and ensure the result is still inside dir
  const resolved = path.resolve(full)
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) return null
  try {
    return fs.readFileSync(resolved, 'utf-8')
  } catch {
    return null
  }
}

function readSourceSnippet(
  root: string,
  file: string,
  line: number,
  context: number
): { file: string; line: number; start: number; end: number; lines: string[] } | null {
  if (!file) return null
  // Resolve to absolute, then constrain to project root for safety.
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file)
  const resolvedRoot = path.resolve(root)
  if (!absolute.startsWith(resolvedRoot + path.sep) && absolute !== resolvedRoot) {
    return null
  }
  let content: string
  try {
    content = fs.readFileSync(absolute, 'utf-8')
  } catch {
    return null
  }
  const allLines = content.split('\n')
  const start = Math.max(1, line - context)
  const end = Math.min(allLines.length, line + context)
  return {
    file: absolute,
    line,
    start,
    end,
    lines: allLines.slice(start - 1, end),
  }
}
