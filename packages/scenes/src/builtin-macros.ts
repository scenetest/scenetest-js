import { defineMacro } from './dsl.js'
import type { Macro } from './dsl.js'

/**
 * Built-in starter macros — opinionated, practical patterns for common
 * UI interactions.  Think of these as "shadcn-style" templates: they ship
 * with scenetest, you opt in via `builtinMacros: true` in your config,
 * and you can override any of them with your own `defineMacro()` call.
 *
 * ## Available macros
 *
 * ### `login`
 * Standard username/password login flow.
 * Uses `[self.username]` and `[self.password]` from the actor config.
 *
 * ### `logout`
 * Click a user-menu, then log out.
 *
 * ### `ensure-visible`
 * Toggle a container open if it isn't already visible.
 * Pass the container selector as the first token, toggle button as second.
 * Example: the sidebar pattern.
 *
 *   ```
 *   // In your scene:
 *   alice.dsl('ensure-visible sidebar-links-list sidebar-toggle')
 *   ```
 *
 *   This is registered as a two-action macro but the *real* pattern is
 *   better expressed using the `if()` API for conditional handling:
 *
 *   ```ts
 *   alice.if('sidebar-toggle', async () => {
 *     // Toggle is visible = sidebar is collapsed, click to expand
 *     await alice.click('sidebar-toggle')
 *   })
 *   await alice.see('sidebar-links-list')
 *   ```
 *
 * ### `dismiss-if-present`
 * Dismiss a modal/banner/toast if it appears, otherwise continue.
 * Best used with the `if()` API:
 *
 *   ```ts
 *   user.if('welcome-modal', async () => {
 *     await user.click('dismiss-button')
 *   })
 *   ```
 *
 * ### `refresh-and-retry`
 * When an error state is on screen, click refresh and wait for
 * the content to reappear.  This is a macro version of a common
 * resilience pattern — real users hit refresh when things break.
 *
 *   ```
 *   // After an error, retry:
 *   alice.dsl('refresh-and-retry')
 *   ```
 *
 * ## Customization
 *
 * Override any built-in macro by calling `defineMacro()` with the same
 * name *after* `registerBuiltinMacros()`.  Your version wins.
 *
 * Or define your own from scratch — the built-in collection is just a
 * starting point.
 */

// ---------------------------------------------------------------------------
// Macro definitions
// ---------------------------------------------------------------------------

/**
 * All built-in macros keyed by name.
 * Exported so users can inspect or selectively register.
 */
export const builtinMacroDefinitions: Record<string, Macro> = {
  /**
   * Standard login flow.
   * Expects actor config to have `username` and `password` fields.
   *
   * ```yaml
   * # actors.ts
   * export default {
   *   alice: { id: 'alice', username: 'alice@test.com', password: 'test123' },
   * }
   * ```
   */
  login: [
    'see login-form',
    'typeInto username [self.username]',
    'typeInto password [self.password]',
    'click login-submit',
    'see dashboard',
  ],

  /**
   * Standard logout flow.
   * Clicks user menu → logout button → verifies login form appears.
   */
  logout: [
    'click user-menu',
    'click logout-button',
    'see login-form',
  ],

  /**
   * Refresh and retry pattern.
   * When something goes wrong, click refresh and wait for main content.
   *
   * Customize the selectors to match your app:
   * - `error-state` — the error indicator
   * - `refresh-button` — the retry/refresh button
   * - `main-content` — what should appear after refresh
   */
  'refresh-and-retry': [
    'click refresh-button',
    'wait 500',
    'see main-content',
  ],

  /**
   * Close cookie/consent banner if present.
   * Many apps show these on first visit.
   */
  'accept-cookies': [
    'see cookie-banner',
    'click accept-cookies',
  ],
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all built-in macros in the global macro registry.
 * Call this from the runner when `builtinMacros: true` is set in config.
 *
 * Macros registered here can be overridden by a later `defineMacro()`
 * call with the same name.
 */
export function registerBuiltinMacros(): void {
  for (const [name, actions] of Object.entries(builtinMacroDefinitions)) {
    defineMacro(name, actions)
  }
}

/**
 * Register a subset of built-in macros by name.
 *
 * ```ts
 * registerSelectedMacros(['login', 'logout'])
 * ```
 */
export function registerSelectedMacros(names: string[]): void {
  for (const name of names) {
    const actions = builtinMacroDefinitions[name]
    if (actions) {
      defineMacro(name, actions)
    }
  }
}
