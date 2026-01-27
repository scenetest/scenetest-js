import type { Page, BrowserContext, Locator } from 'playwright'
import type { ActorConfig, ActorHandle, ActionChain, AssertionResult, TimelineEntry, ScriptWarning, Selector } from './types.js'
import { MessageBus } from './message-bus.js'
import { resolveSelector } from './selectors.js'
import { parseDslLines, parseAction, applyDslAction } from './dsl.js'

/**
 * Action to be executed in a chain
 */
interface QueuedAction {
  name: string
  target?: string
  execute: () => Promise<void>
}

/**
 * Registered watcher for conditional handling
 */
interface Watcher {
  selector: Selector
  callback: () => Promise<void>
  triggered: boolean
}

/**
 * Registered warning trigger - fires when selector becomes visible
 */
interface WarningTrigger {
  selector: Selector
  message: string
  triggered: boolean
}

/**
 * Format a Selector for display in logs/errors
 */
function formatSelector(selector: Selector): string {
  return selector
}


/**
 * Chainable action builder implementation.
 * Queues actions and executes them in sequence when awaited.
 * Tracks current scope for scoped operations.
 */
class ActionChainImpl implements ActionChain {
  private actions: QueuedAction[] = []

  // Current scope - starts as page, changes with see()
  private currentScope: Page | Locator
  // Previous scope stack for prev()
  private scopeStack: Array<Page | Locator> = []

  constructor(
    private actor: ActorHandleImpl,
    private page: Page,
    private bus: MessageBus,
    private timeline: TimelineEntry[],
    private warnings: ScriptWarning[],
    private actionTimeout: number,
    private warnAfter: number
  ) {
    this.currentScope = page
  }

  private addAction(name: string, target: string | undefined, execute: () => Promise<void>): ActionChain {
    this.actions.push({ name, target, execute })
    return this
  }

  /**
   * Push current scope to stack and set new scope
   */
  private pushScope(newScope: Page | Locator): void {
    this.scopeStack.push(this.currentScope)
    this.currentScope = newScope
  }

  /**
   * Get the current scope for resolving selectors
   */
  private getScope(): Page | Locator {
    return this.currentScope
  }

  openTo(url: string): ActionChain {
    return this.addAction('openTo', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
      // Reset scope to page after navigation
      this.currentScope = this.page
      this.scopeStack = []
    })
  }

  see(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('see', target, async () => {
      const locator = resolveSelector(this.getScope(), selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      // Update scope to the found element
      this.pushScope(locator)
    })
  }

  notSee(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('notSee', target, async () => {
      await resolveSelector(this.getScope(), selector).waitFor({ state: 'hidden', timeout: this.actionTimeout })
    })
  }

  seeText(text: string): ActionChain {
    return this.addAction('seeText', text, async () => {
      const locator = this.page.getByText(text).first()
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      // Update scope to the found element
      this.pushScope(locator)
    })
  }

  seeToast(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('seeToast', target, async () => {
      const locator = resolveSelector(this.getScope(), selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      await locator.waitFor({ state: 'hidden', timeout: this.actionTimeout })
      // Don't update scope for toasts since they disappear
    })
  }

  click(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('click', target, async () => {
      await resolveSelector(this.getScope(), selector).click({ timeout: this.actionTimeout })
      // Click stays in current scope
    })
  }

  typeInto(selector: Selector, value: string): ActionChain {
    const target = `${formatSelector(selector)}=${value}`
    return this.addAction('typeInto', target, async () => {
      await resolveSelector(this.getScope(), selector).fill(value, { timeout: this.actionTimeout })
      // typeInto stays in current scope
    })
  }

  check(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('check', target, async () => {
      await resolveSelector(this.getScope(), selector).check({ timeout: this.actionTimeout })
    })
  }

  select(selector: Selector, value: string): ActionChain {
    const target = `${formatSelector(selector)}=${value}`
    return this.addAction('select', target, async () => {
      await resolveSelector(this.getScope(), selector).selectOption(value, { timeout: this.actionTimeout })
    })
  }

  wait(ms: number): ActionChain {
    return this.addAction('wait', `${ms}ms`, async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })
  }

  emit(message: string): ActionChain {
    return this.addAction('emit', message, async () => {
      this.bus.emit(message)
    })
  }

  do(fn: (page: Page) => Promise<void>): ActionChain {
    return this.addAction('do', 'custom', async () => {
      await fn(this.page)
    })
  }

  scrollToBottom(): ActionChain {
    return this.addAction('scrollToBottom', undefined, async () => {
      const scope = this.getScope()
      if (scope === this.page) {
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
        })
      } else {
        await (scope as Locator).evaluate((el) => {
          let current: Element | null = el
          while (current) {
            const style = window.getComputedStyle(current)
            if (
              (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
              current.scrollHeight > current.clientHeight
            ) {
              current.scrollTop = current.scrollHeight
              return
            }
            current = current.parentElement
          }
          window.scrollTo(0, document.body.scrollHeight)
        })
      }
    })
  }

  up(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('up', target, async () => {
      // Navigate up to an ancestor matching the selector
      // This requires finding the ancestor from the page level
      const ancestorLocator = resolveSelector(this.page, selector)

      // Verify the current scope is actually inside this ancestor
      // by checking if the ancestor contains our current scope
      const currentElement = this.currentScope as Locator
      if ('locator' in this.currentScope) {
        // Check if ancestor exists and is visible
        await ancestorLocator.waitFor({ state: 'visible', timeout: this.actionTimeout })
        this.pushScope(ancestorLocator)
      } else {
        // If at page level, just find the selector
        await ancestorLocator.waitFor({ state: 'visible', timeout: this.actionTimeout })
        this.pushScope(ancestorLocator)
      }
    })
  }

  prev(): ActionChain {
    return this.addAction('prev', undefined, async () => {
      if (this.scopeStack.length === 0) {
        // No previous scope, reset to page
        this.currentScope = this.page
      } else {
        this.currentScope = this.scopeStack.pop()!
      }
    })
  }

  dsl(text: string): ActionChain {
    const lines = parseDslLines(text)
    for (const line of lines) {
      const parsed = parseAction(line)
      applyDslAction(this, parsed)
    }
    return this
  }

  /**
   * Delegate warnIf to the owning actor.
   * Not part of the ActionChain public interface, but needed so the chain
   * satisfies DslTarget when dsl() text includes a `warnIf` line.
   */
  warnIf(selector: Selector, message: string): void {
    this.actor.warnIf(selector, message)
  }

  /**
   * Execute a single action while also polling for registered watchers and warnings.
   * If a watcher's selector becomes visible, its callback is executed.
   * If a warning trigger's selector becomes visible, a warning is recorded.
   */
  private async executeWithWatchers(action: QueuedAction): Promise<void> {
    const watchers = this.actor.getWatchers()
    const warningTriggers = this.actor.getWarningTriggers()

    if (watchers.length === 0 && warningTriggers.length === 0) {
      await action.execute()
      return
    }

    let actionComplete = false
    let actionError: unknown = null

    // Run action
    const actionPromise = action.execute()
      .then(() => {
        actionComplete = true
      })
      .catch((err) => {
        actionError = err
        actionComplete = true
      })

    // Poll for watchers and warnings concurrently
    const pollWatchers = async () => {
      const pollInterval = 50
      while (!actionComplete) {
        // Check watchers
        for (const watcher of watchers) {
          if (watcher.triggered) continue
          try {
            const locator = resolveSelector(this.page, watcher.selector)
            const isVisible = await locator.isVisible()
            if (isVisible) {
              watcher.triggered = true
              // Execute callback - this happens "inline" during the wait
              await watcher.callback()
            }
          } catch {
            // Ignore errors from isVisible check
          }
        }

        // Check warning triggers
        for (const trigger of warningTriggers) {
          if (trigger.triggered) continue
          try {
            const locator = resolveSelector(this.page, trigger.selector)
            const isVisible = await locator.isVisible()
            if (isVisible) {
              trigger.triggered = true
              // Record the warning
              this.warnings.push({
                selector: formatSelector(trigger.selector),
                message: trigger.message,
                timestamp: Date.now(),
                actor: this.actor.role,
                duringAction: `${action.name}(${action.target ?? ''})`,
              })
            }
          } catch {
            // Ignore errors from isVisible check
          }
        }

        if (!actionComplete) {
          await new Promise((r) => setTimeout(r, pollInterval))
        }
      }
    }

    // Run both concurrently
    await Promise.all([actionPromise, pollWatchers()])

    if (actionError) {
      throw actionError
    }
  }

  /**
   * Execute all queued actions in sequence.
   * This is called when the chain is awaited.
   * Emits console warnings if actions take longer than warnAfter threshold.
   */
  private async execute(): Promise<void> {
    for (const action of this.actions) {
      const start = Date.now()
      const entry: TimelineEntry = {
        action: action.name,
        target: action.target,
        actor: this.actor.role,
        timestamp: start,
      }

      // Set up warning timer
      let warned = false
      const warnTimer = setInterval(() => {
        const elapsed = Date.now() - start
        if (!warned) {
          warned = true
          console.warn(`⏱ ${elapsed}ms - ${action.name}(${action.target ?? ''}) - still waiting...`)
        } else {
          console.warn(`⏱ ${elapsed}ms - ${action.name}(${action.target ?? ''}) - still waiting...`)
        }
      }, this.warnAfter)

      try {
        await this.executeWithWatchers(action)
        entry.duration = Date.now() - start

        // Log completion if we warned
        if (warned) {
          console.warn(`✓ ${entry.duration}ms - ${action.name}(${action.target ?? ''}) - completed`)
        }
      } catch (err) {
        entry.duration = Date.now() - start
        entry.error = err instanceof Error ? err.message : String(err)
        this.timeline.push(entry)
        throw err
      } finally {
        clearInterval(warnTimer)
      }

      this.timeline.push(entry)
    }
    this.actions = []

    // Clear watchers after chain completes
    this.actor.clearWatchers()
  }

  /**
   * Make the chain thenable so it can be awaited
   */
  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

/**
 * Actor handle implementation with chainable DSL
 */
export class ActorHandleImpl implements ActorHandle {
  readonly role: string
  readonly page: Page
  readonly context: BrowserContext
  readonly assertions: AssertionResult[] = []

  // Registered watchers for conditional handling
  private watchers: Watcher[] = []

  // Registered warning triggers
  private warningTriggers: WarningTrigger[] = []

  // Forward config properties
  readonly id: string
  readonly username?: string
  readonly email?: string
  readonly password?: string
  [key: string]: unknown

  constructor(
    role: string,
    public readonly config: ActorConfig,
    page: Page,
    context: BrowserContext,
    private bus: MessageBus,
    private timeline: TimelineEntry[],
    private warnings: ScriptWarning[],
    private actionTimeout: number,
    private warnAfter: number
  ) {
    this.role = role
    this.page = page
    this.context = context
    this.id = config.id

    // Copy all config properties to this instance
    for (const [key, value] of Object.entries(config)) {
      if (!(key in this)) {
        (this as Record<string, unknown>)[key] = value
      } else if (key !== 'id') {
        (this as Record<string, unknown>)[key] = value
      }
    }
  }

  /**
   * Get registered watchers (used by ActionChainImpl)
   */
  getWatchers(): Watcher[] {
    return this.watchers
  }

  /**
   * Get registered warning triggers (used by ActionChainImpl)
   */
  getWarningTriggers(): WarningTrigger[] {
    return this.warningTriggers
  }

  /**
   * Clear all registered watchers (called after each await)
   * Note: Warning triggers persist across the entire scene
   */
  clearWatchers(): void {
    this.watchers = []
  }

  private createChain(): ActionChainImpl {
    return new ActionChainImpl(this, this.page, this.bus, this.timeline, this.warnings, this.actionTimeout, this.warnAfter)
  }

  openTo(url: string): ActionChain {
    return this.createChain().openTo(url)
  }

  see(selector: Selector): ActionChain {
    return this.createChain().see(selector)
  }

  notSee(selector: Selector): ActionChain {
    return this.createChain().notSee(selector)
  }

  seeText(text: string): ActionChain {
    return this.createChain().seeText(text)
  }

  seeToast(selector: Selector): ActionChain {
    return this.createChain().seeToast(selector)
  }

  click(selector: Selector): ActionChain {
    return this.createChain().click(selector)
  }

  typeInto(selector: Selector, value: string): ActionChain {
    return this.createChain().typeInto(selector, value)
  }

  check(selector: Selector): ActionChain {
    return this.createChain().check(selector)
  }

  select(selector: Selector, value: string): ActionChain {
    return this.createChain().select(selector, value)
  }

  wait(ms: number): ActionChain {
    return this.createChain().wait(ms)
  }

  emit(message: string): ActionChain {
    return this.createChain().emit(message)
  }

  do(fn: (page: Page) => Promise<void>): ActionChain {
    return this.createChain().do(fn)
  }

  scrollToBottom(): ActionChain {
    return this.createChain().scrollToBottom()
  }

  up(selector: Selector): ActionChain {
    return this.createChain().up(selector)
  }

  prev(): ActionChain {
    return this.createChain().prev()
  }

  dsl(text: string): ActionChain {
    return this.createChain().dsl(text)
  }

  /**
   * Register a conditional watcher. If the selector becomes visible during
   * the next awaited action, the callback will be executed.
   * Watchers are cleared after each await.
   *
   * @example
   * ```ts
   * // Handle optional welcome page
   * user.if('welcome-page', () => user.click('dismiss-button'))
   * await user.see('dashboard')  // if welcome-page appears, clicks dismiss first
   * ```
   */
  if(selector: Selector, callback: () => Promise<void>): void {
    this.watchers.push({
      selector,
      callback,
      triggered: false,
    })
  }

  /**
   * Register a script warning. If the selector becomes visible during
   * subsequent actions, a warning is recorded (but test continues).
   * Unlike watchers, warning triggers persist for the entire scene.
   *
   * @example
   * ```ts
   * // We shouldn't see the welcome modal - user has dismiss flag
   * user.warnIf('welcome-modal', 'should not see welcome - user has dismiss flag')
   * await user.openTo('/dashboard')
   * await user.see('main-content')
   * ```
   */
  warnIf(selector: Selector, message: string): void {
    this.warningTriggers.push({
      selector,
      message,
      triggered: false,
    })
  }
}
