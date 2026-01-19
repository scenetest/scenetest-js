import type { Connect, ViteDevServer } from 'vite'
import type { AssertionRpcPayload, AssertionRpcResponse, AssertionResult, ServerContext } from 'scenetest'
import { AsyncLocalStorage } from 'async_hooks'
import { RESOLVED_VIRTUAL_MODULE_ID } from './virtual-module.js'
import { loadConfig } from './config.js'

/**
 * AsyncLocalStorage for collecting assertion results within an assertFn execution
 */
const assertionStorage = new AsyncLocalStorage<AssertionResult[]>()

/**
 * Server-side pass() function that collects results in AsyncLocalStorage
 */
export function pass(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const results = assertionStorage.getStore()
  if (results) {
    results.push({
      type: 'pass',
      description,
      result: condition,
      timestamp: Date.now(),
      context,
    })
  }
}

/**
 * Server-side fail() function that collects results in AsyncLocalStorage
 */
export function fail(description: string, condition: boolean, context?: Record<string, unknown>): void {
  const results = assertionStorage.getStore()
  if (results) {
    results.push({
      type: 'fail',
      description,
      result: !condition, // fail() passes when condition is false
      timestamp: Date.now(),
      context,
    })
  }
}

/**
 * Create the scenetest middleware for handling RPC requests
 */
export function createScenetestMiddleware(server: ViteDevServer, root: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
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

    const { id, title, appData } = payload

    try {
      // Load the virtual module containing all assertFns
      const virtualModule = await server.ssrLoadModule(RESOLVED_VIRTUAL_MODULE_ID)
      const assertions = virtualModule.assertions as Record<string, (server: ServerContext, fromApp: unknown) => void | Promise<void>>

      // Get the assertFn for this ID
      const assertFn = assertions[id] as (
        server: ServerContext,
        fromApp: unknown,
        helpers: { pass: typeof pass; fail: typeof fail }
      ) => void | Promise<void>

      if (!assertFn) {
        const response: AssertionRpcResponse = {
          success: false,
          results: [],
          error: `No assertFn found for id: ${id}`,
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(response))
        return
      }

      // Load config to get server functions
      const config = await loadConfig(root, (id) => server.ssrLoadModule(id))
      const serverContext = (config.serverFunctions || {}) as ServerContext

      // Execute assertFn with AsyncLocalStorage for result collection
      const results: AssertionResult[] = []

      await assertionStorage.run(results, async () => {
        try {
          // Pass the pass/fail helpers directly to the assertFn
          await assertFn(serverContext, appData, { pass, fail })
        } catch (err) {
          results.push({
            type: 'fail',
            description: `${title}: assertFn threw an error`,
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
