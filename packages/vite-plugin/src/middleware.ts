import type { Connect, ViteDevServer } from 'vite'
import type { AssertionRpcPayload, AssertionRpcResponse, AssertionResult, ServerContext } from '@scenetest/checks'
import { AsyncLocalStorage } from 'async_hooks'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { RESOLVED_VIRTUAL_MODULE_ID } from './virtual-module.js'
import { loadConfig } from './config.js'
import { EventHub } from './event-hub.js'
import { generateDashboardHtml } from './dashboard.js'
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

function resolveVendor(specifier: string): string | null {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return null
  }
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
  options: { reportsDir?: string } = {}
): Connect.NextHandleFunction {
  const eventHub = new EventHub()
  let activeReplay: ChildProcess | null = null
  let paused = false

  // Where to look for past JSON run reports. Defaults to the same path the
  // CLI writes to. Resolved against the consumer's project root.
  const reportsDir = path.resolve(root, options.reportsDir ?? 'scenetest/.reports')

  return async (req, res, next) => {
    // ── Analyze app (root) ──────────────────────────────────
    // /__scenetest, /__scenetest/, /__scenetest?…, /__scenetest/?…
    if (req.method === 'GET' && req.url) {
      const pathname = req.url.split('?')[0]
      if (pathname === '/__scenetest' || pathname === '/__scenetest/') {
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

    // ── Dashboard page ──────────────────────────────────────
    if (req.method === 'GET' && req.url === '/__scenetest/dashboard') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(generateDashboardHtml())
      return
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
    if (req.method === 'POST' && req.url === '/__scenetest/events') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
      }

      try {
        const event = JSON.parse(body)
        // Clear buffer on new run so the dashboard starts fresh
        if (event.type === 'run:start') {
          eventHub.clear()
        }
        eventHub.push(event)
      } catch {
        // Ignore malformed events
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end('{"ok":true}')
      return
    }

    // ── Replay endpoint ──────────────────────────────────────
    if (req.method === 'POST' && req.url === '/__scenetest/replay') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
      }

      let file: string | undefined
      try {
        const parsed = JSON.parse(body)
        file = parsed.file
      } catch {
        // No body or invalid JSON — replay all
      }

      // If a replay is already running, kill it first
      if (activeReplay && activeReplay.exitCode === null) {
        activeReplay.kill()
      }

      // Build the CLI args
      const args: string[] = []
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

    try {
      // Load the virtual module containing all serverFns
      const virtualModule = await server.ssrLoadModule(RESOLVED_VIRTUAL_MODULE_ID)
      const assertions = virtualModule.assertions as Record<string, (server: ServerContext, data: unknown) => void | Promise<void>>

      // Get the serverFn for this ID
      const serverFn = assertions[id] as (
        server: ServerContext,
        data: unknown,
        helpers: { should: typeof should; failed: typeof failed }
      ) => void | Promise<void>

      if (!serverFn) {
        const response: AssertionRpcResponse = {
          success: false,
          results: [],
          error: `No serverFn found for id: ${id}`,
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(response))
        return
      }

      // Load config to get server functions
      const config = await loadConfig(root, (id) => server.ssrLoadModule(id))
      const serverContext = (config.server || {}) as ServerContext

      // Execute serverFn with AsyncLocalStorage for result collection
      const results: AssertionResult[] = []

      await assertionStorage.run(results, async () => {
        try {
          // Pass the should/failed helpers directly to the serverFn
          await serverFn(serverContext, data, { should, failed })
        } catch (err) {
          results.push({
            type: 'fail',
            description: `${title}: serverFn threw an error`,
            result: false,
            timestamp: Date.now(),
            context: { error: err instanceof Error ? err.message : String(err) },
          })
        }
      })

      const response: AssertionRpcResponse = {
        success: true,
        results,
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(response))
    } catch (err) {
      console.error('[vite-plugin-scenetest] Middleware error:', err)
      const response: AssertionRpcResponse = {
        success: false,
        results: [],
        error: err instanceof Error ? err.message : String(err),
      }
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(response))
    }
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
