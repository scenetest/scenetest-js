import type { AssertionRpcPayload, AssertionRpcResponse, AssertionResult } from './types.js'

/**
 * Track pending assertion RPC calls for waitForAssertions()
 */
let pendingCount = 0

/**
 * Get the current pending assertion count
 */
export function getPendingCount(): number {
  return pendingCount
}

// Expose pending count to window for Playwright
if (typeof window !== 'undefined') {
  window.__scenecheck_pending = getPendingCount
}

/**
 * Report an assertion result to the test runner (if available)
 */
function report(result: AssertionResult): void {
  if (typeof window !== 'undefined' && window.__scenecheck_report) {
    window.__scenecheck_report(result)
  }
}

/**
 * Parse file location from stack trace
 */
function parseLocation(stack: string | undefined): AssertionResult['location'] {
  if (!stack) return undefined

  const match = stack.match(/(?:at\s+)?(?:\S+\s+\()?(?:https?:\/\/[^/]+)?([^:)]+):(\d+)(?::(\d+))?/)
  if (!match) return undefined

  return {
    file: match[1],
    line: parseInt(match[2], 10),
    column: match[3] ? parseInt(match[3], 10) : undefined,
  }
}

/**
 * Get a simplified stack trace for debugging
 */
function getStack(): string | undefined {
  const err = new Error()
  const stack = err.stack
  if (!stack) return undefined

  // Skip the first 3 lines (Error, getStack, __scenecheck_rpc)
  const lines = stack.split('\n').slice(3)
  return lines.join('\n')
}

/**
 * Internal RPC configuration passed from the transformed assertion() call
 */
export interface RpcConfig {
  /** Unique identifier for this assertion */
  id: string
  /** Human-readable title */
  title: string
  /** Optional disambiguation key */
  key?: string
  /** Function that collects data from the browser */
  withData?: () => unknown
}

/**
 * Execute an assertion RPC call to the server.
 * This is called by transformed assertion() calls in dev mode.
 */
export async function __scenecheck_rpc(config: RpcConfig): Promise<void> {
  const { id, title, key, withData } = config
  const stack = getStack()
  const location = parseLocation(stack)

  pendingCount++

  try {
    // Collect data from browser (if withData is provided)
    let dataValue: unknown = undefined
    if (withData) {
      try {
        dataValue = withData()
      } catch (err) {
        report({
          type: 'fail',
          description: `${title}: withData() threw an error`,
          result: false,
          timestamp: Date.now(),
          stack,
          context: { error: err instanceof Error ? err.message : String(err) },
          location,
          assertionId: id,
        })
        return
      }
    }

    // Build the RPC payload
    const payload: AssertionRpcPayload = {
      id,
      title,
      key,
      data: dataValue,
    }

    // POST to the server
    const response = await fetch('/__scenecheck/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      report({
        type: 'fail',
        description: `${title}: server returned ${response.status}`,
        result: false,
        timestamp: Date.now(),
        stack,
        location,
        assertionId: id,
      })
      return
    }

    const rpcResponse: AssertionRpcResponse = await response.json()

    if (!rpcResponse.success) {
      report({
        type: 'fail',
        description: `${title}: ${rpcResponse.error || 'unknown server error'}`,
        result: false,
        timestamp: Date.now(),
        stack,
        location,
        assertionId: id,
      })
      return
    }

    // Report each result from the server
    for (const result of rpcResponse.results) {
      report({
        ...result,
        // Merge in the browser-side location info
        location: result.location || location,
        assertionId: id,
      })
    }
  } catch (err) {
    report({
      type: 'fail',
      description: `${title}: RPC failed - ${err instanceof Error ? err.message : String(err)}`,
      result: false,
      timestamp: Date.now(),
      stack,
      location,
      assertionId: id,
    })
  } finally {
    pendingCount--
  }
}
