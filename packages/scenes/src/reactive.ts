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
 * import { flow } from '@scenetest/scenes'
 *
 * flow('two users chat', ({ actor }) => {
 *   const alice = actor('alice')
 *   const bob   = actor('bob')
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
 *   // When this function returns, browsers launch in parallel,
 *   // then both actors drain concurrently.
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
  ConcurrentActorHandle,
} from './types.js'
import { MessageBus } from './message-bus.js'
import { resolveSelector } from './selectors.js'
import { parseDslLines, parseAction, applyDslAction } from './dsl.js'
import { scene, getCurrentSession } from './scene.js'

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

/**
 * Escape a value for safe use in selectors.
 *
 * Prevents injection attacks by escaping characters that could break
 * out of selector context (brackets, quotes, backslashes).
 */
function escapeForSelector(value: string): string {
  // Escape backslashes first, then brackets and quotes
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
}

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
// Conditional monitor — the flow model's answer to if()
// ---------------------------------------------------------------------------

/**
 * A persistent conditional monitor.
 *
 * Registered via `if()`.  Polls during every subsequent action in the
 * actor's queue.  When the selector becomes visible, the monitor's
 * sub-actions execute inline (pausing the current action), then the
 * monitor is marked triggered and stops polling.
 *
 * Sub-actions are collected during the declaration phase using the
 * queue-swap trick: the actor's queue pointer is temporarily redirected
 * so that DSL calls inside the callback push to `actions` instead of
 * the main queue.
 */
interface ConditionalMonitor {
  selector: Selector
  actions: QueuedAction[]
  triggered: boolean
}

// ---------------------------------------------------------------------------
// ConcurrentActorHandleImpl
// ---------------------------------------------------------------------------

/**
 * Concurrent actor handle implementation (declarative / flow model).
 *
 * Unlike `SequentialActorHandleImpl`, every DSL method pushes to a single
 * persistent queue on the actor itself and returns `this`.  Scope lives on
 * the actor so it flows naturally through the sequential drain.
 */
export class ConcurrentActorHandleImpl implements ConcurrentActorHandle {
  readonly role: string
  readonly id: string
  readonly username?: string
  readonly email?: string
  readonly password?: string;
  [key: string]: unknown

  private _page: Page | null
  private queue: QueuedAction[] = []
  private currentScope: Page | Locator | null
  private scopeStack: Array<Page | Locator> = []
  private warningTriggers: WarningTrigger[] = []
  private conditionalMonitors: ConditionalMonitor[] = []

  // URL when scope was last set (for detecting navigation-induced staleness)
  private scopeSetUrl = ''
  // Per-entry URLs matching scopeStack (kept in sync)
  private scopeStackUrls: string[] = []

  private _draining = false
  private _aborted = false
  private _abortReason?: string

  /** Registry of all actors in this scene, for [actor.field] interpolation */
  private _actorRegistry: Map<string, ConcurrentActorHandle> | null = null
  /** Team metadata for [team.field] interpolation */
  private _teamMetadata: Record<string, string> | null = null

  constructor(
    role: string,
    config: ActorConfig,
    page: Page | null,
    private bus: MessageBus,
    private timeline: TimelineEntry[],
    private warnings: ScriptWarning[],
    private actionTimeout: number,
    private warnAfter: number
  ) {
    this.role = role
    this._page = page
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

  /**
   * Playwright page for this actor.
   * Available after page initialization (before drain).
   */
  get page(): Page {
    if (!this._page) {
      throw new Error(`Actor "${this.role}" page not initialized. Pages are created before drain.`)
    }
    return this._page
  }

  /**
   * Set the Playwright page for this actor.
   * Called by the flow runner after declaration, before drain.
   */
  _setPage(page: Page): void {
    this._page = page
    this.currentScope = page
  }

  /**
   * Set the actor registry for [actor.field] interpolation.
   * Called by the flow runner after all actors are created.
   */
  _setActorRegistry(registry: Map<string, ConcurrentActorHandle>): void {
    this._actorRegistry = registry
  }

  /**
   * Set team metadata for [team.field] interpolation.
   */
  _setTeamMetadata(metadata: Record<string, string>): void {
    this._teamMetadata = metadata
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
  // Scope helper — scope is always set during drain (page is initialized)
  // -----------------------------------------------------------------------

  private get scope(): Page | Locator {
    return this.currentScope ?? this.page
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
    if (this.currentScope === null || this.currentScope === this.page) return

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

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  openTo(url: string): this {
    return this.push('openTo', url, async () => {
      await this.page.goto(url, { timeout: this.actionTimeout })
      this.currentScope = this.page
      this.scopeStack = []
      this.scopeSetUrl = ''
      this.scopeStackUrls = []
    })
  }

  scrollToBottom(): this {
    return this.push('scrollToBottom', undefined, async () => {
      const scope = this.scope
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
      const locator = resolveSelector(this.scope, selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      this.scopeStack.push(this.scope)
      this.scopeStackUrls.push(this.scopeSetUrl)
      this.currentScope = locator
      this.scopeSetUrl = this.page.url()
    })
  }

  seeInView(selector: Selector): this {
    return this.push('seeInView', selector, async () => {
      const locator = resolveSelector(this.scope, selector)
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
      this.scopeStack.push(this.scope)
      this.scopeStackUrls.push(this.scopeSetUrl)
      this.currentScope = locator
      this.scopeSetUrl = this.page.url()
    })
  }

  notSee(selector: Selector): this {
    return this.push('notSee', selector, async () => {
      await resolveSelector(this.scope, selector).waitFor({
        state: 'hidden',
        timeout: this.actionTimeout,
      })
    })
  }

  seeText(text: string): this {
    return this.push('seeText', text, async () => {
      const locator = this.page.getByText(text).first()
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      this.scopeStack.push(this.scope)
      this.scopeStackUrls.push(this.scopeSetUrl)
      this.currentScope = locator
      this.scopeSetUrl = this.page.url()
    })
  }

  seeToast(selector: Selector): this {
    return this.push('seeToast', selector, async () => {
      const locator = resolveSelector(this.scope, selector)
      await locator.waitFor({ state: 'visible', timeout: this.actionTimeout })
      await locator.waitFor({ state: 'hidden', timeout: this.actionTimeout })
    })
  }

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------

  click(selector?: Selector): this {
    if (!selector) {
      return this.push('click', '(scope)', async () => {
        const scope = this.scope
        if (scope === this.page) {
          throw new Error('click with no selector requires a scope (use see() first)')
        }
        await (scope as Locator).click({ timeout: this.actionTimeout })
      })
    }
    return this.push('click', selector, async () => {
      await resolveSelector(this.scope, selector).click({
        timeout: this.actionTimeout,
      })
    })
  }

  typeInto(selector: Selector, value: string): this {
    return this.push('typeInto', `${selector}=${value}`, async () => {
      await resolveSelector(this.scope, selector).fill(value, {
        timeout: this.actionTimeout,
      })
    })
  }

  check(selector: Selector): this {
    return this.push('check', selector, async () => {
      await resolveSelector(this.scope, selector).check({
        timeout: this.actionTimeout,
      })
    })
  }

  select(selector: Selector, value: string): this {
    return this.push('select', `${selector}=${value}`, async () => {
      await resolveSelector(this.scope, selector).selectOption(value, {
        timeout: this.actionTimeout,
      })
    })
  }

  // -----------------------------------------------------------------------
  // Scope navigation
  // -----------------------------------------------------------------------

  up(selector?: Selector): this {
    if (!selector) {
      return this.push('up', '(root)', async () => {
        this.currentScope = this.page
        this.scopeStack = []
        this.scopeSetUrl = ''
        this.scopeStackUrls = []
      })
    }
    return this.push('up', selector, async () => {
      const ancestorLocator = resolveSelector(this.page, selector)
      await ancestorLocator.waitFor({
        state: 'visible',
        timeout: this.actionTimeout,
      })
      this.scopeStack.push(this.scope)
      this.scopeStackUrls.push(this.scopeSetUrl)
      this.currentScope = ancestorLocator
      this.scopeSetUrl = this.page.url()
    })
  }

  prev(): this {
    return this.push('prev', undefined, async () => {
      if (this.scopeStack.length === 0) {
        this.currentScope = this.page
        this.scopeSetUrl = ''
      } else {
        this.currentScope = this.scopeStack.pop()!
        this.scopeSetUrl = this.scopeStackUrls.pop() ?? ''
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
  // Text DSL
  // -----------------------------------------------------------------------

  /**
   * Queue actions from a text DSL string.
   *
   * Parses the multiline string into individual action lines and pushes
   * each onto the actor's queue.  Returns `this` for chaining.
   *
   * @example
   * ```ts
   * user.dsl(`
   *   openTo /login
   *   see login-form
   *   typeInto email alice@test.com
   *   click submit
   * `)
   * user.see('dashboard')
   * ```
   */
  dsl(text: string): this {
    const lines = parseDslLines(text)
    for (const line of lines) {
      const interpolated = this._interpolate(line)
      const parsed = parseAction(interpolated)
      applyDslAction(this, parsed)
    }
    return this
  }

  /**
   * Interpolate [namespace.field] references in a string.
   *
   * Supported namespaces:
   * - [self.field] — this actor's own fields
   * - [role.field] — another actor's fields (requires actor registry)
   * - [team.field] — team metadata
   */
  private _interpolate(line: string): string {
    return line.replace(
      /\[([\w][\w-]*)\.([\w]+)\]/g,
      (match, namespace: string, field: string) => {
        // [self.field] — current actor's fields
        if (namespace === 'self') {
          const value = (this as Record<string, unknown>)[field]
          if (value === undefined) {
            throw new Error(`[self.${field}] — actor "${this.role}" has no field "${field}"`)
          }
          return escapeForSelector(String(value))
        }

        // [team.field] — team metadata
        if (namespace === 'team') {
          if (!this._teamMetadata) {
            throw new Error(`[team.${field}] — no team metadata available`)
          }
          const value = this._teamMetadata[field]
          if (value === undefined) {
            throw new Error(`[team.${field}] — team has no field "${field}"`)
          }
          return escapeForSelector(String(value))
        }

        // [role.field] — another actor's fields
        if (!this._actorRegistry) {
          throw new Error(
            `[${namespace}.${field}] — cannot reference other actors outside a scene context`
          )
        }
        const actor = this._actorRegistry.get(namespace)
        if (!actor) {
          const available = [...this._actorRegistry.keys()].join(', ')
          throw new Error(
            `[${namespace}.${field}] — unknown actor "${namespace}" (available: ${available})`
          )
        }
        const value = (actor as Record<string, unknown>)[field]
        if (value === undefined) {
          throw new Error(
            `[${namespace}.${field}] — actor "${namespace}" has no field "${field}"`
          )
        }
        return escapeForSelector(String(value))
      }
    )
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

  /**
   * Conditional monitor — "if this appears at any point, do these things."
   *
   * Registers a persistent monitor that polls during every subsequent
   * action in the actor's queue.  When `selector` becomes visible, the
   * sub-actions declared inside `callback` execute inline (the current
   * action is paused, the sub-actions run, then the action resumes).
   * One-shot: the monitor stops polling after it fires once.
   *
   * The callback receives `this` (the actor), but while it runs the
   * actor's internal queue is temporarily swapped so that DSL calls
   * push to the monitor's sub-action list instead of the main queue.
   *
   * @example
   * ```ts
   * alice.openTo('/app')
   * alice.if('welcome-modal', a => a.click('dismiss'))
   * alice.see('dashboard')
   * // If the welcome modal pops up during any action after the if(),
   * // click('dismiss') fires inline, then the action resumes.
   * ```
   */
  if(selector: Selector, callback: (actor: this) => void): void {
    const monitor: ConditionalMonitor = {
      selector,
      actions: [],
      triggered: false,
    }

    // Queue-swap: redirect DSL calls to the monitor's sub-action list
    const mainQueue = this.queue
    this.queue = monitor.actions
    try {
      callback(this)
    } finally {
      this.queue = mainQueue
    }

    this.conditionalMonitors.push(monitor)
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
    if (!this._page) {
      throw new Error(`Actor "${this.role}" cannot drain — page not initialized. Call _setPage() first.`)
    }
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
          await this.executeWithMonitors(action)
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
   * Execute a single action while polling monitors concurrently.
   *
   * Handles both warning triggers (record a warning) and conditional
   * monitors (execute sub-actions inline).
   */
  private async executeWithMonitors(action: QueuedAction): Promise<void> {
    // Validate scope before each action in case a URL change invalidated it
    await this.validateScope()

    const hasWarnings = this.warningTriggers.some((t) => !t.triggered)
    const hasMonitors = this.conditionalMonitors.some((m) => !m.triggered)

    if (!hasWarnings && !hasMonitors) {
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

    const poll = async () => {
      const pollInterval = 50
      while (!actionComplete) {
        // Poll warning triggers
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

        // Poll conditional monitors
        for (const monitor of this.conditionalMonitors) {
          if (monitor.triggered) continue
          try {
            const locator = resolveSelector(this.page, monitor.selector)
            const isVisible = await locator.isVisible()
            if (isVisible) {
              monitor.triggered = true
              // Execute sub-actions inline — shares the actor's scope
              for (const subAction of monitor.actions) {
                await subAction.execute()
              }
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

    await Promise.all([actionPromise, poll()])

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
export async function drainAll(actors: ConcurrentActorHandleImpl[]): Promise<void> {
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
 * import { flow } from '@scenetest/scenes'
 *
 * flow('user updates profile', ({ actor }) => {
 *   const user = actor('user')
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
 * flow('two users chat', ({ actor }) => {
 *   const alice = actor('alice')
 *   const bob   = actor('bob')
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
  // reactive.  The wrapping scene fn handles the three-phase execution.
  scene(name, async (context) => {
    const session = getCurrentSession()
    if (!session) {
      throw new Error('flow() must be run inside the scene runner')
    }

    const reactiveActors: ConcurrentActorHandleImpl[] = []
    const actorRoles: string[] = []

    // Actor registry for [role.field] interpolation across actors
    const actorRegistry = new Map<string, ConcurrentActorHandle>()

    const flowContext: FlowContext = {
      actor: (role: string) => {
        // Check if already created (re-referencing an actor)
        const existing = actorRegistry.get(role)
        if (existing) {
          return existing as ConcurrentActorHandleImpl
        }

        // Resolve config synchronously — no browser needed yet
        const config = session.getActorConfig(role)

        // Create reactive handle without a page (deferred init)
        const reactive = new ConcurrentActorHandleImpl(
          role,
          config,
          null, // page created in phase 2
          session.getMessageBus(),
          session.timeline,
          session.warnings,
          session.actionTimeout,
          session.warnAfter
        )

        reactiveActors.push(reactive)
        actorRoles.push(role)
        actorRegistry.set(role, reactive)
        return reactive
      },
      teamIndex: context.teamIndex,
    }

    // Phase 1: Declaration — user code queues actions, nothing executes.
    //          actor() is synchronous so the flow body can be sync too.
    const result = fn(flowContext)
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result
    }

    // Set actor registry on all actors for [role.field] interpolation
    for (const actor of reactiveActors) {
      actor._setActorRegistry(actorRegistry)
    }

    // Phase 2: Initialize — create browser contexts in parallel
    await Promise.all(
      reactiveActors.map(async (actor, i) => {
        const page = await session.createPage(actorRoles[i])
        actor._setPage(page)
      })
    )

    // Phase 3: Execution — all actors drain concurrently
    await drainAll(reactiveActors)
  })
}
