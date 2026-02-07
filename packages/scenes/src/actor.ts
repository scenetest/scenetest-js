import type { Page, BrowserContext, Locator } from 'playwright'
import type { ActorConfig, SequentialActorHandle, ActionChain, AssertionResult, TimelineEntry, ScriptWarning, Selector, PageFactory } from './types.js'
import { MessageBus } from './message-bus.js'
import { resolveSelector } from './selectors.js'
import { parseDslLines, parseAction, applyDslAction } from './dsl.js'
import { findDevice } from './devices.js'

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

  // URL when scope was last set (for detecting navigation-induced staleness)
  private scopeSetUrl = ''
  // Per-entry URLs matching scopeStack (kept in sync)
  private scopeStackUrls: string[] = []

  constructor(
    private actor: SequentialActorHandleImpl,
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
    this.scopeStackUrls.push(this.scopeSetUrl)
    this.currentScope = newScope
    this.scopeSetUrl = this.page.url()
  }

  /**
   * Get the current scope for resolving selectors
   */
  private getScope(): Page | Locator {
    return this.currentScope
  }

  /**
   * Validate that the current scope is still present in the DOM.
   *
   * Called lazily before each action. When the page URL has changed since the
   * scope was established, we check whether the scope element still exists.
   * If it doesn't, we walk up the scopeStack until we find an ancestor that
   * does, or fall back to the page root.
   */
  private async validateScope(): Promise<void> {
    if (this.currentScope === this.page) return

    const currentUrl = this.page.url()
    if (this.scopeSetUrl && currentUrl === this.scopeSetUrl) return

    // URL changed — check if current scope element still exists
    try {
      const count = await (this.currentScope as Locator).count()
      if (count > 0) {
        // Element survived the navigation
        this.scopeSetUrl = currentUrl
        return
      }
    } catch {
      // Element detached or frame destroyed
    }

    // Current scope is gone — walk up the stack
    while (this.scopeStack.length > 0) {
      const candidate = this.scopeStack.pop()!
      this.scopeStackUrls.pop()

      if (candidate === this.page) {
        this.currentScope = this.page
        this.scopeStack = []
        this.scopeStackUrls = []
        this.scopeSetUrl = ''
        return
      }
      try {
        const count = await (candidate as Locator).count()
        if (count > 0) {
          this.currentScope = candidate
          this.scopeSetUrl = currentUrl
          return
        }
      } catch {
        // Also gone, continue up
      }
    }

    // Nothing in the stack was valid — reset to page root
    this.currentScope = this.page
    this.scopeSetUrl = ''
  }

  openTo(url: string): ActionChain {
    return this.addAction('openTo', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
      // Reset scope to page after navigation
      this.currentScope = this.page
      this.scopeStack = []
      this.scopeSetUrl = ''
      this.scopeStackUrls = []
    })
  }

  refresh(): ActionChain {
    return this.addAction('refresh', undefined, async () => {
      await this.page.reload({ timeout: this.actionTimeout })
      this.currentScope = this.page
      this.scopeStack = []
      this.scopeSetUrl = ''
      this.scopeStackUrls = []
    })
  }

  switchDevice(device?: string): ActionChain {
    return this.addAction('switchDevice', device ?? '(next)', async () => {
      const factory = this.actor.getPageFactory()
      if (!factory) {
        throw new Error('switchDevice requires the scene runner (page factory not available)')
      }
      const profile = device ? findDevice(device) : null
      // Factory closes old context, creates new one with assertion wiring
      const { page, context } = await factory(profile)
      // Update actor's backing references
      this.actor._switchPage(page, context)
      // Update chain's local page reference
      this.page = page
      // Reset scope to new page root
      this.currentScope = this.page
      this.scopeStack = []
      this.scopeSetUrl = ''
      this.scopeStackUrls = []
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

  seeInView(selector: Selector): ActionChain {
    const target = formatSelector(selector)
    return this.addAction('seeInView', target, async () => {
      const locator = resolveSelector(this.getScope(), selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      // Verify element is within the viewport without scrolling
      const inViewport = await locator.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const vh = window.innerHeight || document.documentElement.clientHeight
        const vw = window.innerWidth || document.documentElement.clientWidth
        return rect.top >= 0 && rect.left >= 0 && rect.bottom <= vh && rect.right <= vw
      })
      if (!inViewport) {
        throw new Error(
          `Element "${selector}" is visible but not in the viewport (requires scrolling)`
        )
      }
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

  click(selector?: Selector): ActionChain {
    if (!selector) {
      return this.addAction('click', '(scope)', async () => {
        const scope = this.getScope()
        if (scope === this.page) {
          throw new Error('click with no selector requires a scope (use see() first)')
        }
        await (scope as Locator).click({ timeout: this.actionTimeout })
      })
    }
    const target = formatSelector(selector)
    return this.addAction('click', target, async () => {
      await resolveSelector(this.getScope(), selector).click({ timeout: this.actionTimeout })
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

  waitFor(message: string): ActionChain {
    return this.addAction('waitFor', message, async () => {
      await this.bus.waitFor(message)
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

  up(selector?: Selector): ActionChain {
    if (!selector) {
      return this.addAction('up', '(root)', async () => {
        this.currentScope = this.page
        this.scopeStack = []
        this.scopeSetUrl = ''
        this.scopeStackUrls = []
      })
    }
    const target = formatSelector(selector)
    return this.addAction('up', target, async () => {
      const ancestorLocator = resolveSelector(this.page, selector)
      await ancestorLocator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      this.pushScope(ancestorLocator)
    })
  }

  prev(): ActionChain {
    return this.addAction('prev', undefined, async () => {
      if (this.scopeStack.length === 0) {
        // No previous scope, reset to page
        this.currentScope = this.page
        this.scopeSetUrl = ''
      } else {
        this.currentScope = this.scopeStack.pop()!
        this.scopeSetUrl = this.scopeStackUrls.pop() ?? ''
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
    // Validate scope before each action in case a URL change invalidated it
    await this.validateScope()

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
 * Sequential actor handle implementation (classic driver model).
 * Each DSL method creates a new ActionChain, executed on await.
 */
export class SequentialActorHandleImpl implements SequentialActorHandle {
  readonly role: string
  private _page: Page
  private _context: BrowserContext
  readonly assertions: AssertionResult[] = []

  // Registered watchers for conditional handling
  private watchers: Watcher[] = []

  // Registered warning triggers
  private warningTriggers: WarningTrigger[] = []

  // Page factory for switchDevice support
  private _pageFactory: PageFactory | null

  // Forward config properties
  readonly key: string
  readonly username?: string
  readonly email?: string
  readonly password?: string;
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
    private warnAfter: number,
    pageFactory?: PageFactory | null
  ) {
    this.role = role
    this._page = page
    this._context = context
    this._pageFactory = pageFactory ?? null
    this.key = config.key

    // Copy all config properties to this instance
    for (const [k, value] of Object.entries(config)) {
      if (!(k in this)) {
        (this as Record<string, unknown>)[k] = value
      } else if (k !== 'key') {
        (this as Record<string, unknown>)[k] = value
      }
    }
  }

  /** Playwright page for this actor */
  get page(): Page {
    return this._page
  }

  /** Playwright browser context for this actor */
  get context(): BrowserContext {
    return this._context
  }

  /** Get the page factory (used by ActionChainImpl for switchDevice) */
  getPageFactory(): PageFactory | null {
    return this._pageFactory
  }

  /** Update page and context after a device switch */
  _switchPage(page: Page, context: BrowserContext): void {
    this._page = page
    this._context = context
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

  refresh(): ActionChain {
    return this.createChain().refresh()
  }

  switchDevice(device?: string): ActionChain {
    return this.createChain().switchDevice(device)
  }

  see(selector: Selector): ActionChain {
    return this.createChain().see(selector)
  }

  seeInView(selector: Selector): ActionChain {
    return this.createChain().seeInView(selector)
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

  click(selector?: Selector): ActionChain {
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

  waitFor(message: string): ActionChain {
    return this.createChain().waitFor(message)
  }

  do(fn: (page: Page) => Promise<void>): ActionChain {
    return this.createChain().do(fn)
  }

  scrollToBottom(): ActionChain {
    return this.createChain().scrollToBottom()
  }

  up(selector?: Selector): ActionChain {
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
