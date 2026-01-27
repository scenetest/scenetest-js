import type { DslTarget, Selector } from './types.js'

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
 *   click [<selector>]              - Click element (or current scope if no selector)
 *   typeInto <selector> <value>     - Fill input
 *   check <selector>                - Check checkbox
 *   select <selector> <value>       - Select dropdown option
 *   wait <ms>                       - Wait milliseconds
 *   emit <message>                  - Emit to message bus
 *   waitFor <message>               - Block until message arrives (flow/reactive only)
 *   warnIf <selector> <message>     - Register script warning
 *   up [<selector>]                 - Navigate scope to ancestor (or page root if no selector)
 *   prev                            - Return to previous scope
 *   scrollToBottom                   - Scroll current scope to bottom
 *   seeInView <selector>            - Wait for element visible AND in viewport (no scroll)
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
export interface ParsedAction {
  action: string
  selector?: string
  value?: string
}

export function parseAction(line: string): ParsedAction {
  const trimmed = line.trim()
  if (!trimmed) {
    throw new Error('Empty action line')
  }

  // Split on first space to get action name
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) {
    // Action with no arguments (click, prev, scrollToBottom)
    return { action: trimmed }
  }

  const action = trimmed.slice(0, firstSpace)
  const rest = trimmed.slice(firstSpace + 1).trim()

  // Actions that take only a selector
  const selectorOnlyActions = ['see', 'seeInView', 'notSee', 'click', 'check', 'seeToast', 'up']

  // Actions that take a value only (no selector)
  const valueOnlyActions = ['openTo', 'seeText', 'wait', 'emit', 'waitFor']

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
 * Parse a multiline DSL string into individual action lines.
 * Skips empty lines and comments (lines starting with # or //).
 */
export function parseDslLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))
}

/**
 * Apply a single parsed DSL action to any target that has DSL methods.
 *
 * This is the synchronous core — it calls the method on the target without
 * awaiting.  For scene-model targets (ActorHandle / ActionChain) the method
 * returns an ActionChain; for reactive targets it returns the actor.  Either
 * way the caller doesn't inspect the return value.
 */
export function applyDslAction(target: DslTarget, parsed: ParsedAction): void {
  const { action, selector, value } = parsed

  switch (action) {
    case 'openTo':
      if (!value) throw new Error('openTo requires a URL')
      target.openTo(value)
      break

    case 'see':
      if (!selector) throw new Error('see requires a selector')
      target.see(selector)
      break

    case 'seeInView':
      if (!selector) throw new Error('seeInView requires a selector')
      target.seeInView(selector)
      break

    case 'notSee':
      if (!selector) throw new Error('notSee requires a selector')
      target.notSee(selector)
      break

    case 'seeText':
      if (!value) throw new Error('seeText requires text')
      target.seeText(value)
      break

    case 'seeToast':
      if (!selector) throw new Error('seeToast requires a selector')
      target.seeToast(selector)
      break

    case 'click':
      target.click(selector)
      break

    case 'typeInto':
      if (!selector) throw new Error('typeInto requires a selector')
      if (!value) throw new Error('typeInto requires a value')
      target.typeInto(selector, value)
      break

    case 'check':
      if (!selector) throw new Error('check requires a selector')
      target.check(selector)
      break

    case 'select':
      if (!selector) throw new Error('select requires a selector')
      if (!value) throw new Error('select requires a value')
      target.select(selector, value)
      break

    case 'wait':
      if (!value) throw new Error('wait requires milliseconds')
      const ms = parseInt(value, 10)
      if (isNaN(ms)) throw new Error(`wait requires a number, got: ${value}`)
      target.wait(ms)
      break

    case 'emit':
      if (!value) throw new Error('emit requires a message')
      target.emit(value)
      break

    case 'warnIf':
      if (!selector) throw new Error('warnIf requires a selector')
      if (!value) throw new Error('warnIf requires a message')
      target.warnIf(selector, value)
      break

    case 'up':
      target.up(selector)
      break

    case 'prev':
      target.prev()
      break

    case 'scrollToBottom':
      target.scrollToBottom()
      break

    case 'waitFor':
      if (!value) throw new Error('waitFor requires a message')
      if (!target.waitFor) throw new Error('waitFor is only available in flow() / .spec.md scenes')
      target.waitFor(value)
      break

    default:
      throw new Error(`Unknown DSL action: ${action}`)
  }
}

/**
 * Execute a sequence of DSL actions against any actor (scene or flow model).
 *
 * For scene-model actors (`ActorHandle`), each call creates and awaits an
 * `ActionChain` — execution is sequential and immediate.
 *
 * For reactive actors (`ReactiveActor`), each call pushes to the actor's
 * queue — nothing executes until the flow runner drains.  The `await` on
 * the non-thenable return value is a harmless no-op.
 *
 * @example
 * ```ts
 * // scene() model — awaited
 * await runDsl(user, [
 *   'openTo /dashboard',
 *   'see main-content',
 *   'click settings-button',
 * ])
 *
 * // flow() model — queues, no actual awaiting
 * runDsl(user, [
 *   'openTo /dashboard',
 *   'see main-content',
 *   'click settings-button',
 * ])
 * ```
 */
export async function runDsl(actor: DslTarget, actions: DslAction[]): Promise<void> {
  for (const actionLine of actions) {
    // Skip empty lines and comments
    const trimmed = actionLine.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue
    }

    const parsed = parseAction(trimmed)
    // await is needed for scene model (ActionChain is thenable);
    // harmless no-op for reactive model (returns non-thenable actor)
    await applyDslAction(actor, parsed)
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
 * Execute a macro with optional variable substitution.
 *
 * Works with both scene-model and reactive actors (see `runDsl`).
 *
 * @example
 * ```ts
 * await runMacro(user, 'login', { username: 'testuser', password: 'secret' })
 * ```
 */
export async function runMacro(
  actor: DslTarget,
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
