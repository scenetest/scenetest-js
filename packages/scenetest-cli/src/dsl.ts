import type { ActorHandle, Selector } from './types.js'

/**
 * Text DSL Grammar:
 *
 * <action> <selector> [<value>]
 *
 * Actions:
 *   openTo <url>                    - Navigate to URL
 *   see <selector>                  - Wait for element visible
 *   notSee <selector>               - Wait for element hidden
 *   seeText <text>                  - Wait for text visible
 *   seeToast <selector>             - Wait for element appear then disappear
 *   click <selector>                - Click element
 *   typeInto <selector> <value>     - Fill input
 *   check <selector>                - Check checkbox
 *   select <selector> <value>       - Select dropdown option
 *   wait <ms>                       - Wait milliseconds
 *   emit <message>                  - Emit to message bus
 *   warnIf <selector> <message>     - Register script warning
 *
 * Selectors can be:
 *   - Simple: 'button'
 *   - Nested: 'modal form submit-button'
 *   - With key: ['playlist-row', '12345'] (as JSON in text)
 *
 * Examples:
 *   'openTo /dashboard'
 *   'see main-content'
 *   'click modal close-button'
 *   'typeInto username-input testuser'
 *   'warnIf welcome-modal should not see welcome - user has dismiss flag'
 */

export type DslAction = string

/**
 * Parse a DSL action string into its components
 */
interface ParsedAction {
  action: string
  selector?: string
  value?: string
}

function parseAction(line: string): ParsedAction {
  const trimmed = line.trim()
  if (!trimmed) {
    throw new Error('Empty action line')
  }

  // Split on first space to get action name
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) {
    // Action with no arguments (shouldn't happen for most actions)
    return { action: trimmed }
  }

  const action = trimmed.slice(0, firstSpace)
  const rest = trimmed.slice(firstSpace + 1).trim()

  // Actions that take only a selector
  const selectorOnlyActions = ['see', 'notSee', 'click', 'check', 'seeToast']

  // Actions that take a value only (no selector)
  const valueOnlyActions = ['openTo', 'seeText', 'wait', 'emit']

  // Actions that take selector + value (everything after first selector word is value)
  const selectorValueActions = ['typeInto', 'select', 'warnIf']

  if (valueOnlyActions.includes(action)) {
    return { action, value: rest }
  }

  if (selectorOnlyActions.includes(action)) {
    return { action, selector: rest }
  }

  if (selectorValueActions.includes(action)) {
    // For these, we need to figure out where selector ends and value begins
    // The selector is the first word(s) that form a valid selector
    // For typeInto/select: 'selector value'
    // For warnIf: 'selector message with spaces'

    // Simple heuristic: first word is selector, rest is value
    const selectorEnd = rest.indexOf(' ')
    if (selectorEnd === -1) {
      return { action, selector: rest }
    }

    const selector = rest.slice(0, selectorEnd)
    const value = rest.slice(selectorEnd + 1).trim()
    return { action, selector, value }
  }

  // Unknown action - treat as selector-only
  return { action, selector: rest }
}

/**
 * Execute a single DSL action against an actor
 */
async function executeAction(actor: ActorHandle, parsed: ParsedAction): Promise<void> {
  const { action, selector, value } = parsed

  switch (action) {
    case 'openTo':
      if (!value) throw new Error('openTo requires a URL')
      await actor.openTo(value)
      break

    case 'see':
      if (!selector) throw new Error('see requires a selector')
      await actor.see(selector)
      break

    case 'notSee':
      if (!selector) throw new Error('notSee requires a selector')
      await actor.notSee(selector)
      break

    case 'seeText':
      if (!value) throw new Error('seeText requires text')
      await actor.seeText(value)
      break

    case 'seeToast':
      if (!selector) throw new Error('seeToast requires a selector')
      await actor.seeToast(selector)
      break

    case 'click':
      if (!selector) throw new Error('click requires a selector')
      await actor.click(selector)
      break

    case 'typeInto':
      if (!selector) throw new Error('typeInto requires a selector')
      if (!value) throw new Error('typeInto requires a value')
      await actor.typeInto(selector, value)
      break

    case 'check':
      if (!selector) throw new Error('check requires a selector')
      await actor.check(selector)
      break

    case 'select':
      if (!selector) throw new Error('select requires a selector')
      if (!value) throw new Error('select requires a value')
      await actor.select(selector, value)
      break

    case 'wait':
      if (!value) throw new Error('wait requires milliseconds')
      const ms = parseInt(value, 10)
      if (isNaN(ms)) throw new Error(`wait requires a number, got: ${value}`)
      await actor.wait(ms)
      break

    case 'emit':
      if (!value) throw new Error('emit requires a message')
      await actor.emit(value)
      break

    case 'warnIf':
      if (!selector) throw new Error('warnIf requires a selector')
      if (!value) throw new Error('warnIf requires a message')
      actor.warnIf(selector, value)
      break

    default:
      throw new Error(`Unknown DSL action: ${action}`)
  }
}

/**
 * Execute a sequence of DSL actions
 *
 * @example
 * ```ts
 * await runDsl(user, [
 *   'openTo /dashboard',
 *   'see main-content',
 *   'click settings-button',
 *   'see settings-modal',
 *   'typeInto name-input New Name',
 *   'click save-button',
 *   'seeToast success-toast',
 * ])
 * ```
 */
export async function runDsl(actor: ActorHandle, actions: DslAction[]): Promise<void> {
  for (const actionLine of actions) {
    // Skip empty lines and comments
    const trimmed = actionLine.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue
    }

    const parsed = parseAction(trimmed)
    await executeAction(actor, parsed)
  }
}

/**
 * Define a macro as a named sequence of DSL actions
 */
export type Macro = DslAction[]

/**
 * Macro registry for reusable action sequences
 */
const macroRegistry = new Map<string, Macro>()

/**
 * Register a named macro
 *
 * @example
 * ```ts
 * defineMacro('login', [
 *   'see login-form',
 *   'typeInto username {{username}}',
 *   'typeInto password {{password}}',
 *   'click submit-button',
 *   'see dashboard',
 * ])
 * ```
 */
export function defineMacro(name: string, actions: Macro): void {
  macroRegistry.set(name, actions)
}

/**
 * Get a registered macro by name
 */
export function getMacro(name: string): Macro | undefined {
  return macroRegistry.get(name)
}

/**
 * Execute a macro with optional variable substitution
 *
 * @example
 * ```ts
 * await runMacro(user, 'login', { username: 'testuser', password: 'secret' })
 * ```
 */
export async function runMacro(
  actor: ActorHandle,
  name: string,
  vars?: Record<string, string>
): Promise<void> {
  const macro = macroRegistry.get(name)
  if (!macro) {
    throw new Error(`Macro not found: ${name}`)
  }

  // Substitute variables
  const actions = vars
    ? macro.map((action) => {
        let result = action
        for (const [key, value] of Object.entries(vars)) {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
        }
        return result
      })
    : macro

  await runDsl(actor, actions)
}

/**
 * Clear all registered macros
 */
export function clearMacros(): void {
  macroRegistry.clear()
}
