import type { DslTarget, Selector } from './types.js'

/**
 * Text DSL Grammar:
 *
 * <action> <selector> [<value>]
 *
 * Actions:
 *   openTo <url>                    - Navigate to URL
 *   reload                          - Reload the current page
 *   goBack                          - Navigate back in browser history
 *   goForward                       - Navigate forward in browser history
 *   switchDevice [<name>]           - Switch to new device (new browser context)
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
 *   waitFor <message>               - Block until message arrives on the bus
 *   warnIf <selector> <message>     - Register script warning
 *   up [<selector>]                 - Navigate scope to ancestor (or page root if no selector)
 *   prev                            - Return to previous scope
 *   scrollToBottom                   - Scroll current scope to bottom
 *   seeInView <selector>            - Wait for element visible AND in viewport (no scroll)
 *   ifClick <selector>               - Click element if currently visible (no-op if hidden)
 *   scope <selector>                 - Wait for element visible and set as current scope
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
 * Extract the last token from a string.
 * A token is either a quoted string ('...' or "...") or a single word.
 *
 * @returns { before: string, token: string } where `before` is everything
 *          before the last token (trimmed), and `token` is the extracted value
 *          (with quotes removed if quoted).
 *
 * @example
 * extractLastToken('modal search-input hello')
 * // => { before: 'modal search-input', token: 'hello' }
 *
 * extractLastToken("search-input 'hello world'")
 * // => { before: 'search-input', token: 'hello world' }
 *
 * extractLastToken('single')
 * // => { before: '', token: 'single' }
 */
function extractLastToken(str: string): { before: string; token: string } {
  const trimmed = str.trim()

  // Check if ends with a quoted string
  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar === "'" || lastChar === '"') {
    // Find the matching opening quote
    const quote = lastChar
    let i = trimmed.length - 2
    while (i >= 0 && trimmed[i] !== quote) {
      i--
    }
    if (i >= 0) {
      // Found matching quote
      const token = trimmed.slice(i + 1, -1) // Remove quotes
      const before = trimmed.slice(0, i).trim()
      return { before, token }
    }
  }

  // No quotes — last word is the token
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) {
    return { before: '', token: trimmed }
  }

  return {
    before: trimmed.slice(0, lastSpace).trim(),
    token: trimmed.slice(lastSpace + 1),
  }
}

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
  const selectorOnlyActions = ['see', 'seeInView', 'notSee', 'click', 'check', 'seeToast', 'up', 'ifClick', 'scope']

  // Actions that take a value only (no selector)
  const valueOnlyActions = ['openTo', 'seeText', 'wait', 'emit', 'waitFor', 'switchDevice', 'pressKey']

  // Actions that take selector + value (everything after first selector word is value)
  const selectorValueActions = ['typeInto', 'select', 'warnIf']

  if (valueOnlyActions.includes(action)) {
    return { action, value: rest }
  }

  if (selectorOnlyActions.includes(action)) {
    return { action, selector: rest }
  }

  if (selectorValueActions.includes(action)) {
    // For these, selector can be multi-word (nested), value is the last token.
    // A token is either a quoted string ('...' or "...") or a single word.
    //
    // Examples:
    //   typeInto email alice@test.com        → selector=email, value=alice@test.com
    //   typeInto modal search-input hello    → selector="modal search-input", value=hello
    //   typeInto search-input 'hello world'  → selector=search-input, value="hello world"
    //   warnIf modal 'should not appear'     → selector=modal, value="should not appear"

    const { before, token } = extractLastToken(rest)
    if (before) {
      return { action, selector: before, value: token }
    } else {
      // Only one token — it's the selector, no value
      return { action, selector: token }
    }
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

    case 'reload':
      target.reload()
      break

    case 'goBack':
      target.goBack()
      break

    case 'goForward':
      target.goForward()
      break

    case 'switchDevice':
      target.switchDevice(value || undefined)
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

    case 'scope':
      if (!selector) throw new Error('scope requires a selector')
      target.scope(selector)
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
      target.waitFor(value)
      break

    case 'pressKey':
      if (!value) throw new Error('pressKey requires a key name (e.g. Escape, Enter, Tab)')
      target.pressKey(value)
      break

    case 'ifClick':
      if (!selector) throw new Error('ifClick requires a selector')
      target.ifClick(selector)
      break

    default:
      throw new Error(`Unknown DSL action: ${action}`)
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
 * Register a named macro.
 *
 * Macros use `[namespace.field]` interpolation:
 * - `[self.field]` — current actor's fields
 * - `[alias.field]` — aliased actor from macro call (e.g., `target=alice`)
 * - `[team.field]` — team metadata
 *
 * @example
 * ```ts
 * defineMacro('login', [
 *   'see login-form',
 *   'typeInto username [self.username]',
 *   'typeInto password [self.password]',
 *   'click submit-button',
 *   'see dashboard',
 * ])
 *
 * defineMacro('send-friend-request', [
 *   'typeInto search [target.username]',
 *   'click send-request-button',
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
 * Clear all registered macros
 */
export function clearMacros(): void {
  macroRegistry.clear()
}
