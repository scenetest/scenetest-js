import type { Connect, ViteDevServer } from 'vite'
import type { AssertionRpcPayload, AssertionRpcResponse, AssertionResult, ServerContext } from '@scenetest/core'
import { AsyncLocalStorage } from 'async_hooks'
import { RESOLVED_VIRTUAL_MODULE_ID } from './virtual-module.js'
import { loadConfig } from './config.js'

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
 * Create the scenetest middleware for handling RPC requests and serving the observer.
 *
 * SECURITY NOTE: This middleware executes user-provided assertion code
 * from the virtual module in the dev server context with full Node.js
 * privileges. This is dev-only tooling - never expose to untrusted code
 * or networks. See README.md "Security Considerations" for details.
 */
export function createScenetestMiddleware(server: ViteDevServer, root: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    // Serve the observer module at /__scenetest/observer.js
    if (req.method === 'GET' && req.url === '/__scenetest/observer.js') {
      try {
        // Resolve the observer's auto entry point
        const resolved = await server.pluginContainer.resolveId('@scenetest/observer/auto')
        if (!resolved) {
          res.statusCode = 404
          res.end('Observer module not found')
          return
        }

        // Transform the module through Vite's pipeline
        const result = await server.transformRequest(resolved.id)
        if (!result) {
          res.statusCode = 500
          res.end('Failed to transform observer module')
          return
        }

        res.setHeader('Content-Type', 'application/javascript')
        res.end(result.code)
        return
      } catch (err) {
        console.error('[vite-plugin-scenetest] Error serving observer:', err)
        res.statusCode = 500
        res.end('Error serving observer module')
        return
      }
    }

    // Only handle POST /__scenetest/run
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
      const serverContext = (config.serverFunctions || {}) as ServerContext

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
