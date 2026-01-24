import type { Page, BrowserContext } from 'playwright'
import type { ActorConfig, ActorHandle, ActionChain, AssertionResult, TimelineEntry, SceneEvent } from './types.js'
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

  goto(url: string): ActionChain {
    return this.addAction('goto', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
    })
  }

  seeId(testId: string): ActionChain {
    return this.addAction('seeId', testId, async () => {
      await this.page.getByTestId(testId).waitFor({ state: 'visible', timeout: this.actionTimeout })
    })
  }

  seeText(text: string): ActionChain {
    return this.addAction('seeText', text, async () => {
      await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: this.actionTimeout })
    })
  }

  clickId(testId: string): ActionChain {
    return this.addAction('clickId', testId, async () => {
      await this.page.getByTestId(testId).click({ timeout: this.actionTimeout })
    })
  }

  typeInto(testId: string, value: string): ActionChain {
    return this.addAction('typeInto', `${testId}=${value}`, async () => {
      await this.page.getByTestId(testId).fill(value, { timeout: this.actionTimeout })
    })
  }

  check(testId: string): ActionChain {
    return this.addAction('check', testId, async () => {
      await this.page.getByTestId(testId).check({ timeout: this.actionTimeout })
    })
  }

  select(testId: string, value: string): ActionChain {
    return this.addAction('select', `${testId}=${value}`, async () => {
      await this.page.getByTestId(testId).selectOption(value, { timeout: this.actionTimeout })
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

  happens(description: string, data?: unknown): ActionChain {
    // Create narrative event name: "role description"
    const eventName = `${this.actor.role} ${description}`
    return this.addAction('happens', eventName, async () => {
      this.bus.emitEvent({
        name: eventName,
        actor: this.actor.role,
        data,
        timestamp: Date.now(),
      })
    })
  }

  do(fn: (page: Page) => Promise<void>): ActionChain {
    return this.addAction('do', 'custom', async () => {
      await fn(this.page)
    })
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
        await action.execute()
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

  private createChain(): ActionChainImpl {
    return new ActionChainImpl(this, this.page, this.bus, this.timeline, this.actionTimeout)
  }

  goto(url: string): ActionChain {
    return this.createChain().goto(url)
  }

  seeId(testId: string): ActionChain {
    return this.createChain().seeId(testId)
  }

  seeText(text: string): ActionChain {
    return this.createChain().seeText(text)
  }

  clickId(testId: string): ActionChain {
    return this.createChain().clickId(testId)
  }

  typeInto(testId: string, value: string): ActionChain {
    return this.createChain().typeInto(testId, value)
  }

  check(testId: string): ActionChain {
    return this.createChain().check(testId)
  }

  select(testId: string, value: string): ActionChain {
    return this.createChain().select(testId, value)
  }

  wait(ms: number): ActionChain {
    return this.createChain().wait(ms)
  }

  emit(message: string): ActionChain {
    return this.createChain().emit(message)
  }

  happens(description: string, data?: unknown): ActionChain {
    return this.createChain().happens(description, data)
  }

  do(fn: (page: Page) => Promise<void>): ActionChain {
    return this.createChain().do(fn)
  }
}
