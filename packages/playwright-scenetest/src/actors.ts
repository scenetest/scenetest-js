import { test as base, type Browser, type BrowserContext, type Page, type Locator } from '@playwright/test'
import type { AssertionResult } from 'scenetest'

/**
 * Message bus for inter-actor communication.
 * Allows actors to wait for events from other actors.
 */
export class MessageBus {
  private listeners = new Map<string, Array<() => void>>()
  private emittedMessages = new Set<string>()

  /**
   * Emit a message to the bus
   */
  emit(message: string): void {
    this.emittedMessages.add(message)
    const callbacks = this.listeners.get(message)
    if (callbacks) {
      for (const cb of callbacks) {
        cb()
      }
      this.listeners.delete(message)
    }
  }

  /**
   * Wait for a message to be emitted
   */
  waitFor(message: string, timeout = 30000): Promise<void> {
    // If already emitted, resolve immediately
    if (this.emittedMessages.has(message)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message: "${message}"`))
      }, timeout)

      const callbacks = this.listeners.get(message) || []
      callbacks.push(() => {
        clearTimeout(timer)
        resolve()
      })
      this.listeners.set(message, callbacks)
    })
  }

  /**
   * Check if a message has been emitted
   */
  hasEmitted(message: string): boolean {
    return this.emittedMessages.has(message)
  }

  /**
   * Clear all messages and listeners
   */
  clear(): void {
    this.listeners.clear()
    this.emittedMessages.clear()
  }
}

/**
 * Chainable action builder that queues actions to be executed in sequence.
 * All methods return `this` for chaining except terminal methods.
 */
export class ActorChain {
  private actions: Array<() => Promise<void>> = []
  private currentLocator: Locator | null = null

  constructor(
    private actor: Actor,
    private page: Page
  ) {}

  /**
   * Execute all queued actions in sequence
   */
  async execute(): Promise<void> {
    for (const action of this.actions) {
      await action()
    }
    this.actions = []
  }

  /**
   * Wait for an element with the given test ID to be visible
   */
  seeId(testId: string): ActorChain {
    this.actions.push(async () => {
      this.currentLocator = this.page.getByTestId(testId)
      await this.currentLocator.waitFor({ state: 'visible' })
    })
    return this
  }

  /**
   * Alias for seeId - emphasizes sequential waiting
   */
  thenSeeId(testId: string): ActorChain {
    return this.seeId(testId)
  }

  /**
   * Click an element with the given test ID
   */
  clickId(testId: string): ActorChain {
    this.actions.push(async () => {
      this.currentLocator = this.page.getByTestId(testId)
      await this.currentLocator.click()
    })
    return this
  }

  /**
   * Get an element by test ID and set it as the current locator for chaining
   */
  getById(testId: string): ActorChain {
    this.actions.push(async () => {
      this.currentLocator = this.page.getByTestId(testId)
      await this.currentLocator.waitFor({ state: 'visible' })
    })
    return this
  }

  /**
   * Click using a CSS selector (within current locator if set)
   */
  click(selector: string): ActorChain {
    this.actions.push(async () => {
      if (this.currentLocator) {
        await this.currentLocator.locator(selector).click()
      } else {
        await this.page.locator(selector).click()
      }
    })
    return this
  }

  /**
   * Assert that text is visible on the page
   */
  thenReadText(text: string): ActorChain {
    this.actions.push(async () => {
      await this.page.getByText(text).waitFor({ state: 'visible' })
    })
    return this
  }

  /**
   * Type text into an input field with the given test ID
   */
  typeInto(testId: string, text: string): ActorChain {
    this.actions.push(async () => {
      const locator = this.page.getByTestId(testId)
      await locator.fill(text)
    })
    return this
  }

  /**
   * Wait for a specific amount of time (use sparingly)
   */
  wait(ms: number): ActorChain {
    this.actions.push(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })
    return this
  }

  /**
   * Execute a custom action
   */
  do(fn: (page: Page, locator: Locator | null) => Promise<void>): ActorChain {
    this.actions.push(async () => {
      await fn(this.page, this.currentLocator)
    })
    return this
  }

  /**
   * Emit a message to the message bus after completing the chain
   */
  thenEmit(message: string): ActorChain {
    this.actions.push(async () => {
      this.actor.emit(message)
    })
    return this
  }
}

/**
 * Extended page with scenetest assertion collection for actors
 */
export interface ActorPage extends Page {
  /** All assertions collected during this test */
  readonly assertions: AssertionResult[]
  /** Assertions that passed */
  readonly passed: AssertionResult[]
  /** Assertions that failed */
  readonly failed: AssertionResult[]
}

/**
 * Represents a single actor (user) in a multi-actor test.
 * Each actor has their own browser context and page.
 */
export class Actor {
  private _page: ActorPage | null = null
  private _context: BrowserContext | null = null
  private assertions: AssertionResult[] = []
  private watchHandlers = new Map<string, Array<() => Promise<void>>>()

  constructor(
    public readonly id: string,
    public readonly username: string,
    private browser: Browser,
    private messageBus: MessageBus
  ) {}

  /**
   * Get the actor's page (creates context/page on first access)
   */
  get page(): ActorPage {
    if (!this._page) {
      throw new Error(`Actor ${this.id} has not been initialized. Call openBrowserTo() first.`)
    }
    return this._page
  }

  /**
   * Get the actor's browser context
   */
  get context(): BrowserContext {
    if (!this._context) {
      throw new Error(`Actor ${this.id} has not been initialized. Call openBrowserTo() first.`)
    }
    return this._context
  }

  /**
   * Initialize the actor's browser context and page
   */
  private async initialize(): Promise<void> {
    if (this._context) return

    this._context = await this.browser.newContext()
    const page = await this._context.newPage()

    // Set up scenetest assertion collection
    await page.exposeFunction('__scenetest_report', (result: AssertionResult) => {
      this.assertions.push(result)
    })

    // Extend page with assertion accessors
    const actorPage = page as ActorPage
    Object.defineProperty(actorPage, 'assertions', {
      get: () => this.assertions,
    })
    Object.defineProperty(actorPage, 'passed', {
      get: () => this.assertions.filter((a) => a.result === true),
    })
    Object.defineProperty(actorPage, 'failed', {
      get: () => this.assertions.filter((a) => a.result === false),
    })

    this._page = actorPage
  }

  /**
   * Open the browser to a specific URL
   */
  async openBrowserTo(url: string): Promise<ActorChain> {
    await this.initialize()
    await this._page!.goto(url)
    return new ActorChain(this, this._page!)
  }

  /**
   * Start a new action chain on the current page
   */
  chain(): ActorChain {
    return new ActorChain(this, this.page)
  }

  /**
   * Shortcut: see an element and return a chain
   */
  seeId(testId: string): ActorChain {
    return this.chain().seeId(testId)
  }

  /**
   * Shortcut: alias for seeId emphasizing sequential execution
   */
  thenSeeId(testId: string): ActorChain {
    return this.chain().thenSeeId(testId)
  }

  /**
   * Shortcut: click an element and return a chain
   */
  clickId(testId: string): ActorChain {
    return this.chain().clickId(testId)
  }

  /**
   * Emit a message to the bus for other actors to watch for
   */
  emit(message: string): void {
    this.messageBus.emit(message)
  }

  /**
   * Watch for a trigger and then perform an action.
   *
   * The trigger can be:
   * - A string: waits for that message on the bus
   * - A function: executes the function (typically an action chain)
   *
   * The action can be:
   * - A string: emits that message to the bus when trigger fires
   * - A function: executes the function with a fresh ActorChain
   *
   * @example
   * ```ts
   * // When user2 accepts, user1 sees the confirmation
   * user1.watchFor(
   *   'user2 accepts request',
   *   async (chain) => chain.thenSeeId('alert-confirmed').execute()
   * )
   *
   * // Watch for UI change, then emit message
   * user1.watchFor(
   *   () => user1.thenSeeId('alert-confirmed').execute(),
   *   'user1 sees confirmation'
   * )
   * ```
   */
  watchFor(
    trigger: string | (() => Promise<void>),
    action: string | ((chain: ActorChain) => Promise<void>)
  ): void {
    const executeAction = async () => {
      if (typeof action === 'string') {
        this.emit(action)
      } else {
        const chain = new ActorChain(this, this.page)
        await action(chain)
      }
    }

    if (typeof trigger === 'string') {
      // Wait for message, then execute action
      this.messageBus.waitFor(trigger).then(executeAction)
    } else {
      // Execute trigger function, then execute action
      trigger().then(executeAction)
    }
  }

  /**
   * Wait for a message from the message bus
   */
  async waitFor(message: string, timeout?: number): Promise<void> {
    await this.messageBus.waitFor(message, timeout)
  }

  /**
   * Close the actor's browser context
   */
  async close(): Promise<void> {
    if (this._context) {
      await this._context.close()
      this._context = null
      this._page = null
    }
  }
}

/**
 * Factory for creating multiple actors with a shared message bus.
 */
export class ActorFactory {
  private actors: Actor[] = []
  private messageBus = new MessageBus()
  private actorCounter = 0

  constructor(private browser: Browser) {}

  /**
   * Create a new actor with an optional username
   */
  create(username?: string): Actor {
    this.actorCounter++
    const id = `actor${this.actorCounter}`
    const name = username || `user${this.actorCounter}`
    const actor = new Actor(id, name, this.browser, this.messageBus)
    this.actors.push(actor)
    return actor
  }

  /**
   * Get all created actors
   */
  all(): Actor[] {
    return [...this.actors]
  }

  /**
   * Close all actor contexts
   */
  async closeAll(): Promise<void> {
    await Promise.all(this.actors.map((a) => a.close()))
    this.actors = []
    this.messageBus.clear()
  }
}

/**
 * Fixtures for multi-actor tests
 */
export interface ActorsFixtures {
  /**
   * Factory for creating multiple actors (users) with separate browser contexts.
   * Actors can communicate via a shared message bus.
   */
  actorFactory: ActorFactory
}

/**
 * Extended Playwright test with multi-actor fixtures
 */
export const actorsTest = base.extend<ActorsFixtures>({
  actorFactory: async ({ browser }, use) => {
    const factory = new ActorFactory(browser)
    await use(factory)
    await factory.closeAll()
  },
})

/**
 * Create a tuple of actors for destructuring.
 *
 * @example
 * ```ts
 * actorsTest('friend request flow', async ({ actorFactory }) => {
 *   const [user1, user2] = actors(actorFactory, 2)
 *   // or with usernames:
 *   const [alice, bob] = actors(actorFactory, ['alice', 'bob'])
 * })
 * ```
 */
export function actors(factory: ActorFactory, count: number): Actor[]
export function actors(factory: ActorFactory, usernames: string[]): Actor[]
export function actors(factory: ActorFactory, countOrUsernames: number | string[]): Actor[] {
  if (typeof countOrUsernames === 'number') {
    return Array.from({ length: countOrUsernames }, () => factory.create())
  }
  return countOrUsernames.map((username) => factory.create(username))
}
