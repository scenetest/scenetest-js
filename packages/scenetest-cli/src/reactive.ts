/**
 * Reactive flow execution model.
 *
 * In the standard `scene()` model, `await` is the trigger — actions queue
 * on a chain and execute only when awaited.  The test writer carries a
 * mental timeline: "has this happened yet?  do I need to wait?"
 *
 * In the reactive `flow()` model:
 *
 *   1. Actor DSL calls are **declarations** — they push to a persistent
 *      per-actor queue and return immediately.
 *   2. After the flow function returns, all actors **drain their queues
 *      concurrently** — each actor advances through its own queue as fast
 *      as the DOM allows.
 *   3. `see()`, `seeText()`, and friends already poll/wait for DOM state,
 *      so cross-actor synchronization happens *through the application
 *      under test* rather than through `await` ordering in the script.
 *
 * This eliminates the "test-writer conceptualisation race condition" —
 * you can declare `bob.seeText('Hello')` at any point relative to
 * `alice.click('send')` and it will work, because bob's queue reaches
 * that instruction whenever it reaches it.  If the text is already
 * there, it resolves instantly.  If not, it polls.  No `waitUntil`
 * API is needed.
 *
 * @example
 * ```ts
 * import { flow } from '@scenetest/cli'
 *
 * flow('two users chat', async ({ actor }) => {
 *   const alice = await actor('alice')
 *   const bob   = await actor('bob')
 *
 *   // Declaration phase — nothing executes yet
 *   alice.openTo('/chat')
 *   alice.see('message-input').typeInto('message-input', 'Hello!').click('send')
 *
 *   bob.openTo('/chat')
 *   bob.seeText('Hello!')
 *   // ↑ no race: bob will poll for "Hello!" whenever he gets to that
 *   //   instruction in his queue.  alice may or may not have sent it yet.
 *
 *   // When this function returns, both actors drain concurrently.
 * })
 * ```
 */

import type { Page, Locator } from 'playwright'
import type {
  ActorConfig,
  Selector,
  TimelineEntry,
  ScriptWarning,
  FlowContext,
  FlowFn,
  ReactiveActor,
} from './types.js'
import { MessageBus } from './message-bus.js'
import { resolveSelector } from './selectors.js'
import { scene, getCurrentSession } from './scene.js'

// ---------------------------------------------------------------------------
// Queued action
// ---------------------------------------------------------------------------

interface QueuedAction {
  name: string
  target?: string
  execute: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Warning trigger (same shape as actor.ts, kept local to avoid coupling)
// ---------------------------------------------------------------------------

interface WarningTrigger {
  selector: Selector
  message: string
  triggered: boolean
}

// ---------------------------------------------------------------------------
// ReactiveActorHandle
// ---------------------------------------------------------------------------

/**
 * Reactive actor handle implementation.
 *
 * Unlike `ActorHandleImpl`, every DSL method pushes to a single persistent
 * queue on the actor itself and returns `this`.  Scope lives on the actor
 * so it flows naturally through the sequential drain.
 */
export class ReactiveActorHandle implements ReactiveActor {
  readonly role: string
  readonly page: Page
  readonly id: string
  readonly username?: string
  readonly email?: string
  readonly password?: string;
  [key: string]: unknown

  private queue: QueuedAction[] = []
  private currentScope: Page | Locator
  private scopeStack: Array<Page | Locator> = []
  private warningTriggers: WarningTrigger[] = []

  private _draining = false
  private _aborted = false
  private _abortReason?: string

  constructor(
    role: string,
    config: ActorConfig,
    page: Page,
    private bus: MessageBus,
    private timeline: TimelineEntry[],
    private warnings: ScriptWarning[],
    private actionTimeout: number,
    private warnAfter: number
  ) {
    this.role = role
    this.page = page
    this.currentScope = page
    this.id = config.id

    // Forward all config properties
    for (const [key, value] of Object.entries(config)) {
      if (!(key in this)) {
        ;(this as Record<string, unknown>)[key] = value
      } else if (key !== 'id') {
        ;(this as Record<string, unknown>)[key] = value
      }
    }
  }

  // -----------------------------------------------------------------------
  // Queue management
  // -----------------------------------------------------------------------

  private push(
    name: string,
    target: string | undefined,
    execute: () => Promise<void>
  ): this {
    this.queue.push({ name, target, execute })
    return this
  }

  /** Number of queued actions */
  get pending(): number {
    return this.queue.length
  }

  /** Whether this actor has been aborted by a peer failure */
  get aborted(): boolean {
    return this._aborted
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  openTo(url: string): this {
    return this.push('openTo', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
      this.currentScope = this.page
      this.scopeStack = []
    })
  }

  scrollToBottom(): this {
    return this.push('scrollToBottom', undefined, async () => {
      const scope = this.currentScope
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

  // -----------------------------------------------------------------------
  // Observation
  // -----------------------------------------------------------------------

  see(selector: Selector): this {
    return this.push('see', selector, async () => {
      const locator = resolveSelector(this.currentScope, selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      this.scopeStack.push(this.currentScope)
      this.currentScope = locator
    })
  }

  notSee(selector: Selector): this {
    return this.push('notSee', selector, async () => {
      await resolveSelector(this.currentScope, selector).waitFor({
        state: 'hidden',
        timeout: this.actionTimeout,
      })
    })
  }

  seeText(text: string): this {
    return this.push('seeText', text, async () => {
      const locator = this.page.getByText(text).first()
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      this.scopeStack.push(this.currentScope)
      this.currentScope = locator
    })
  }

  seeToast(selector: Selector): this {
    return this.push('seeToast', selector, async () => {
      const locator = resolveSelector(this.currentScope, selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      await locator.waitFor({ state: 'hidden', timeout: this.actionTimeout })
    })
  }

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------

  click(selector: Selector): this {
    return this.push('click', selector, async () => {
      await resolveSelector(this.currentScope, selector).click({
        timeout: this.actionTimeout,
      })
    })
  }

  typeInto(selector: Selector, value: string): this {
    return this.push('typeInto', `${selector}=${value}`, async () => {
      await resolveSelector(this.currentScope, selector).fill(value, {
        timeout: this.actionTimeout,
      })
    })
  }

  check(selector: Selector): this {
    return this.push('check', selector, async () => {
      await resolveSelector(this.currentScope, selector).check({
        timeout: this.actionTimeout,
      })
    })
  }

  select(selector: Selector, value: string): this {
    return this.push('select', `${selector}=${value}`, async () => {
      await resolveSelector(this.currentScope, selector).selectOption(value, {
        timeout: this.actionTimeout,
      })
    })
  }

  // -----------------------------------------------------------------------
  // Scope navigation
  // -----------------------------------------------------------------------

  up(selector: Selector): this {
    return this.push('up', selector, async () => {
      const ancestorLocator = resolveSelector(this.page, selector)
      await ancestorLocator.waitFor({
        state: 'visible',
        timeout: this.actionTimeout,
      })
      this.scopeStack.push(this.currentScope)
      this.currentScope = ancestorLocator
    })
  }

  prev(): this {
    return this.push('prev', undefined, async () => {
      if (this.scopeStack.length === 0) {
        this.currentScope = this.page
      } else {
        this.currentScope = this.scopeStack.pop()!
      }
    })
  }

  // -----------------------------------------------------------------------
  // Timing & coordination
  // -----------------------------------------------------------------------

  wait(ms: number): this {
    return this.push('wait', `${ms}ms`, async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })
  }

  emit(message: string): this {
    return this.push('emit', message, async () => {
      this.bus.emit(message)
    })
  }

  /**
   * Block this actor's queue until a message arrives on the bus.
   *
   * Because the bus is sticky, if the message was already emitted this
   * resolves immediately — no race.
   */
  waitFor(message: string): this {
    return this.push('waitFor', message, async () => {
      await this.bus.waitFor(message)
    })
  }

  // -----------------------------------------------------------------------
  // Escape hatch
  // -----------------------------------------------------------------------

  do(fn: (page: Page) => Promise<void>): this {
    return this.push('do', 'custom', async () => {
      await fn(this.page)
    })
  }

  // -----------------------------------------------------------------------
  // Monitoring
  // -----------------------------------------------------------------------

  /**
   * Register a persistent warning trigger.
   * If the selector becomes visible during any action, a warning is recorded.
   * Unlike the `scene()` model, there are no watchers that clear after
   * each await — warnings are the right primitive for reactive flows.
   */
  warnIf(selector: Selector, message: string): void {
    this.warningTriggers.push({ selector, message, triggered: false })
  }

  // -----------------------------------------------------------------------
  // Abort
  // -----------------------------------------------------------------------

  /**
   * Abort this actor's queue. Called by `drainAll` when a peer actor fails.
   * The actor will throw at its next action boundary.
   */
  abort(reason: string): void {
    this._aborted = true
    this._abortReason = reason
  }

  // -----------------------------------------------------------------------
  // Drain — the execution engine
  // -----------------------------------------------------------------------

  /**
   * Drain the action queue.
   *
   * Executes all queued actions sequentially.  Called automatically by the
   * flow runner after the declaration phase completes.
   *
   * Each action is executed with concurrent warning-trigger polling (same
   * approach as `ActionChainImpl.executeWithWatchers`).
   */
  async drain(): Promise<void> {
    if (this._draining) {
      throw new Error(`Actor "${this.role}" is already draining`)
    }
    this._draining = true

    try {
      for (const action of this.queue) {
        // Check abort before each action
        if (this._aborted) {
          throw new Error(
            `Actor "${this.role}" aborted: ${this._abortReason}`
          )
        }

        const start = Date.now()
        const entry: TimelineEntry = {
          action: action.name,
          target: action.target,
          actor: this.role,
          timestamp: start,
        }

        // Slow-action warning timer
        let warned = false
        const warnTimer = setInterval(() => {
          const elapsed = Date.now() - start
          console.warn(
            `⏱ ${elapsed}ms - ${this.role}.${action.name}(${action.target ?? ''}) - still waiting...`
          )
          warned = true
        }, this.warnAfter)

        try {
          await this.executeWithWarnings(action)
          entry.duration = Date.now() - start

          if (warned) {
            console.warn(
              `✓ ${entry.duration}ms - ${this.role}.${action.name}(${action.target ?? ''}) - completed`
            )
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
    } finally {
      this.queue = []
      this._draining = false
    }
  }

  /**
   * Execute a single action while polling warning triggers concurrently.
   */
  private async executeWithWarnings(action: QueuedAction): Promise<void> {
    if (this.warningTriggers.length === 0) {
      await action.execute()
      return
    }

    let actionComplete = false
    let actionError: unknown = null

    const actionPromise = action
      .execute()
      .then(() => {
        actionComplete = true
      })
      .catch((err) => {
        actionError = err
        actionComplete = true
      })

    const pollWarnings = async () => {
      const pollInterval = 50
      while (!actionComplete) {
        for (const trigger of this.warningTriggers) {
          if (trigger.triggered) continue
          try {
            const locator = resolveSelector(this.page, trigger.selector)
            const isVisible = await locator.isVisible()
            if (isVisible) {
              trigger.triggered = true
              this.warnings.push({
                selector: trigger.selector,
                message: trigger.message,
                timestamp: Date.now(),
                actor: this.role,
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

    await Promise.all([actionPromise, pollWarnings()])

    if (actionError) {
      throw actionError
    }
  }
}

// ---------------------------------------------------------------------------
// drainAll — concurrent executor
// ---------------------------------------------------------------------------

/**
 * Drain all actors concurrently.
 *
 * When any actor fails, all others are aborted so they don't hang waiting
 * for DOM state that will never arrive.  We use `Promise.allSettled` to
 * collect all results and throw the first *original* (non-abort) error.
 */
export async function drainAll(actors: ReactiveActorHandle[]): Promise<void> {
  if (actors.length === 0) return
  if (actors.length === 1) {
    await actors[0].drain()
    return
  }

  const drainPromises = actors.map((actor) =>
    actor.drain().catch((err: unknown) => {
      // On failure, signal all peers to stop
      const msg = err instanceof Error ? err.message : String(err)
      for (const other of actors) {
        if (other !== actor && !other.aborted) {
          other.abort(`${actor.role} failed: ${msg}`)
        }
      }
      throw err
    })
  )

  const results = await Promise.allSettled(drainPromises)
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  )

  if (failures.length > 0) {
    // Prefer the first non-abort error
    const original = failures.find(
      (f) => !(f.reason instanceof Error && f.reason.message.includes(' aborted: '))
    )
    throw (original ?? failures[0]).reason
  }
}

// ---------------------------------------------------------------------------
// flow() — reactive scene registration
// ---------------------------------------------------------------------------

/**
 * Define a reactive flow.
 *
 * Inside the flow function, actor DSL calls just queue actions — nothing
 * executes.  After the function returns, all actors drain their queues
 * concurrently through the application.
 *
 * @example
 * ```ts
 * import { flow } from '@scenetest/cli'
 *
 * flow('user updates profile', async ({ actor }) => {
 *   const user = await actor('user')
 *
 *   user.openTo('/login')
 *   user
 *     .see('login-form')
 *     .typeInto('email', user.email!)
 *     .typeInto('password', user.password!)
 *     .click('submit')
 *
 *   user.see('dashboard')
 *   user.openTo('/profile')
 *   user
 *     .see('profile-form')
 *     .typeInto('name-input', 'New Name')
 *     .click('save-button')
 *
 *   user.seeText('New Name')
 * })
 * ```
 *
 * @example Multi-actor
 * ```ts
 * flow('two users chat', async ({ actor }) => {
 *   const alice = await actor('alice')
 *   const bob   = await actor('bob')
 *
 *   alice.openTo('/chat')
 *   alice.see('message-input').typeInto('message-input', 'Hello!').click('send')
 *
 *   bob.openTo('/chat')
 *   bob.seeText('Hello!')
 * })
 * ```
 */
export function flow(name: string, fn: FlowFn): void {
  // Register as a normal scene — the runner doesn't need to know it's
  // reactive.  The wrapping scene fn handles the two-phase execution.
  scene(name, async (context) => {
    const session = getCurrentSession()
    if (!session) {
      throw new Error('flow() must be run inside the scene runner')
    }

    const reactiveActors: ReactiveActorHandle[] = []

    const flowContext: FlowContext = {
      actor: async (role: string) => {
        // Use the existing session to create browser context / page
        const actorImpl = await session.getActor(role)

        // Wrap with reactive handle sharing the same infrastructure
        const reactive = new ReactiveActorHandle(
          role,
          actorImpl.config,
          actorImpl.page,
          session.getMessageBus(),
          session.timeline,
          session.warnings,
          session.actionTimeout,
          session.warnAfter
        )

        reactiveActors.push(reactive)
        return reactive
      },
      teamIndex: context.teamIndex,
    }

    // Phase 1: Declaration — user code queues actions, nothing executes
    await fn(flowContext)

    // Phase 2: Execution — all actors drain concurrently
    await drainAll(reactiveActors)
  })
}
