import type { ExtractedAssertion } from './transform.js'

/**
 * Virtual module ID for scenetest assertions
 */
export const VIRTUAL_MODULE_ID = 'virtual:scenetest-assertions'
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

/**
 * Registry of extracted assertions from all transformed files
 */
const assertionRegistry = new Map<string, ExtractedAssertion>()

/**
 * Register extracted assertions from a file transform
 */
export function registerAssertions(assertions: ExtractedAssertion[]): void {
  for (const assertion of assertions) {
    assertionRegistry.set(assertion.id, assertion)
  }
}

/**
 * Get an assertion by ID
 */
export function getAssertion(id: string): ExtractedAssertion | undefined {
  return assertionRegistry.get(id)
}

/**
 * Get all registered assertions
 */
export function getAllAssertions(): ExtractedAssertion[] {
  return Array.from(assertionRegistry.values())
}

/**
 * Clear all registered assertions (called on buildStart)
 */
export function clearRegistry(): void {
  assertionRegistry.clear()
}

/**
 * Remove assertions from a specific file (for HMR)
 */
export function removeAssertionsForFile(filename: string): void {
  for (const [id, assertion] of assertionRegistry) {
    if (assertion.location.file === filename) {
      assertionRegistry.delete(id)
    }
  }
}

/**
 * Generate the virtual module code.
 * This module exports a map of assertion IDs to their serverFn functions.
 *
 * Each serverFn is wrapped as an `async` arrow so that bodies using `await`
 * (the common case — serverCheck exists to do async server work) parse and
 * run. It receives the author's first two parameters followed by an injected
 * `{ should, failed }` argument, making those helpers available in scope for
 * the inlined body code.
 *
 * SECURITY NOTE: This function embeds user-provided assertion code directly
 * into the generated module. The code runs in the Vite dev server context
 * with full Node.js privileges. This is intentional for dev/test tooling,
 * but means you should only run Scenetest with trusted code. See README.md
 * "Security Considerations" section for details.
 */
export function generateVirtualModuleCode(): string {
  const assertions = getAllAssertions()

  if (assertions.length === 0) {
    return `export const assertions = {}`
  }

  // Generate an object with all serverFn functions.
  // The original serverFn body is inlined into an async wrapper function that
  // provides should/failed in scope via parameter destructuring. The author's
  // own parameters are kept so destructured patterns keep resolving.
  const entries = assertions.map((assertion) => {
    const params = assertion.params || 'server, data'
    return `  ${JSON.stringify(assertion.id)}: async (${params}, { should, failed }) => {
    ${assertion.serverFnBodyCode}
  }`
  })

  const code = `export const assertions = {
${entries.join(',\n')}
}`

  return code
}
