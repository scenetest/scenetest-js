import type { Page, BrowserContext, Locator } from 'playwright'
import type { ActorConfig, ActorHandle, ActionChain, AssertionResult, TimelineEntry } from './types.js'
import { MessageBus } from './message-bus.js'

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
  selector: string
  callback: () => Promise<void>
  triggered: boolean
}

/**
 * Resolve a selector string into a Playwright locator.
 * Supports nested selectors separated by spaces: 'parent child grandchild'
 * Each part is treated as a test ID.
 */
function resolveSelector(page: Page, selector: string): Locator {
  const parts = selector.trim().split(/\s+/)
  let locator = page.getByTestId(parts[0])
  for (let i = 1; i < parts.length; i++) {
    locator = locator.getByTestId(parts[i])
  }
  return locator
}

/**
 * Chainable action builder implementation.
 * Queues actions and executes them in sequence when awaited.
 */
class ActionChainImpl implements ActionChain {
  private actions: QueuedAction[] = []

  constructor(
    private actor: ActorHandleImpl,
    private page: Page,
    private bus: MessageBus,
    private timeline: TimelineEntry[],
    private actionTimeout: number
  ) {}

  private addAction(name: string, target: string | undefined, execute: () => Promise<void>): ActionChain {
    this.actions.push({ name, target, execute })
    return this
  }

  openTo(url: string): ActionChain {
    return this.addAction('openTo', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
    })
  }

  see(selector: string): ActionChain {
    return this.addAction('see', selector, async () => {
      await resolveSelector(this.page, selector).waitFor({ state: 'visible', timeout: this.actionTimeout })
    })
  }

  notSee(selector: string): ActionChain {
    return this.addAction('notSee', selector, async () => {
      await resolveSelector(this.page, selector).waitFor({ state: 'hidden', timeout: this.actionTimeout })
    })
  }

  seeText(text: string): ActionChain {
    return this.addAction('seeText', text, async () => {
      await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: this.actionTimeout })
    })
  }

  seeToast(selector: string): ActionChain {
    return this.addAction('seeToast', selector, async () => {
      const locator = resolveSelector(this.page, selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      await locator.waitFor({ state: 'hidden', timeout: this.actionTimeout })
    })
  }

  click(selector: string): ActionChain {
    return this.addAction('click', selector, async () => {
      await resolveSelector(this.page, selector).click({ timeout: this.actionTimeout })
    })
  }

  typeInto(selector: string, value: string): ActionChain {
    return this.addAction('typeInto', `${selector}=${value}`, async () => {
      await resolveSelector(this.page, selector).fill(value, { timeout: this.actionTimeout })
    })
  }

  check(selector: string): ActionChain {
    return this.addAction('check', selector, async () => {
      await resolveSelector(this.page, selector).check({ timeout: this.actionTimeout })
    })
  }

  select(selector: string, value: string): ActionChain {
    return this.addAction('select', `${selector}=${value}`, async () => {
      await resolveSelector(this.page, selector).selectOption(value, { timeout: this.actionTimeout })
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

  /**
   * Execute a single action while also polling for registered watchers.
   * If a watcher's selector becomes visible, its callback is executed.
   */
  private async executeWithWatchers(action: QueuedAction): Promise<void> {
    const watchers = this.actor.getWatchers()

    if (watchers.length === 0) {
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

    // Poll for watchers concurrently
    const pollWatchers = async () => {
      const pollInterval = 50
      while (!actionComplete) {
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

      try {
        await this.executeWithWatchers(action)
        entry.duration = Date.now() - start
      } catch (err) {
        entry.duration = Date.now() - start
        entry.error = err instanceof Error ? err.message : String(err)
        this.timeline.push(entry)
        throw err
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
    private actionTimeout: number
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
   * Clear all registered watchers (called after each await)
   */
  clearWatchers(): void {
    this.watchers = []
  }

  private createChain(): ActionChainImpl {
    return new ActionChainImpl(this, this.page, this.bus, this.timeline, this.actionTimeout)
  }

  openTo(url: string): ActionChain {
    return this.createChain().openTo(url)
  }

  see(selector: string): ActionChain {
    return this.createChain().see(selector)
  }

  notSee(selector: string): ActionChain {
    return this.createChain().notSee(selector)
  }

  seeText(text: string): ActionChain {
    return this.createChain().seeText(text)
  }

  seeToast(selector: string): ActionChain {
    return this.createChain().seeToast(selector)
  }

  click(selector: string): ActionChain {
    return this.createChain().click(selector)
  }

  typeInto(selector: string, value: string): ActionChain {
    return this.createChain().typeInto(selector, value)
  }

  check(selector: string): ActionChain {
    return this.createChain().check(selector)
  }

  select(selector: string, value: string): ActionChain {
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
  if(selector: string, callback: () => Promise<void>): void {
    this.watchers.push({
      selector,
      callback,
      triggered: false,
    })
  }
}
