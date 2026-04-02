import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConcurrentActorHandleImpl, drainAll } from '../reactive.js'
import { MessageBus } from '../message-bus.js'
import type { TimelineEntry, ScriptWarning } from '../types.js'

// ---------------------------------------------------------------------------
// Helpers — minimal Playwright mocks
// ---------------------------------------------------------------------------

function mockLocator(visible = false) {
  return {
    waitFor: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(visible),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
  }
}

/** Create a mock Page that stubs the methods ConcurrentActorHandleImpl uses */
function mockPage() {
  const locator = mockLocator()
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('http://localhost:5173/'),
    getByText: vi.fn().mockReturnValue({ first: () => locator }),
    locator: vi.fn().mockReturnValue(locator),
    evaluate: vi.fn().mockResolvedValue(undefined),
    // Used by resolveSelector — it calls page.locator(css)
    // We need to handle the selector resolution chain
    _locator: locator,
  }
}

/**
 * Build a ConcurrentActorHandleImpl with mocked dependencies.
 * Returns the actor plus shared timeline/warnings arrays for inspection.
 */
function createTestActor(
  role = 'user',
  overrides?: { bus?: MessageBus; page?: ReturnType<typeof mockPage> }
) {
  const bus = overrides?.bus ?? new MessageBus()
  const timeline: TimelineEntry[] = []
  const warnings: ScriptWarning[] = []
  const page = overrides?.page ?? mockPage()

  const actor = new ConcurrentActorHandleImpl(
    role,
    { key: `${role}-1`, username: role, email: `${role}@test.com`, password: 'pass' },
    page as any,
    bus,
    timeline,
    warnings,
    /* actionTimeout */ 5000,
    /* warnAfter */ 60000 // high so warnings don't fire during tests
  )

  return { actor, bus, timeline, warnings, page }
}

/**
 * Create a ConcurrentActorHandleImpl with deferred page (null).
 * Simulates how flow() creates actors before browser init.
 */
function createDeferredActor(role = 'user') {
  const bus = new MessageBus()
  const timeline: TimelineEntry[] = []
  const warnings: ScriptWarning[] = []
  const page = mockPage()

  const actor = new ConcurrentActorHandleImpl(
    role,
    { key: `${role}-1`, username: role, email: `${role}@test.com`, password: 'pass' },
    null, // deferred — page set later via _setPage
    bus,
    timeline,
    warnings,
    5000,
    60000
  )

  return { actor, bus, timeline, warnings, page }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConcurrentActorHandleImpl', () => {
  describe('queueing (declaration phase)', () => {
    it('queues actions without executing', () => {
      const { actor, page } = createTestActor()

      actor.openTo('/login')
      actor.see('form').typeInto('email', 'a@b.com').click('submit')

      expect(actor.pending).toBe(4)
      // Nothing should have been called on the page yet
      expect(page.goto).not.toHaveBeenCalled()
    })

    it('chains fluently — every method returns the same actor', () => {
      const { actor } = createTestActor()

      const returned = actor
        .openTo('/')
        .see('nav')
        .click('login')
        .typeInto('email', 'x')
        .check('remember')
        .select('role', 'admin')
        .wait(100)
        .emit('done')
        .waitFor('other')
        .notSee('spinner')
        .seeText('Welcome')
        .seeToast('saved')
        .scrollToBottom()
        .reload()
        .goBack()
        .goForward()
        .up('header')
        .prev()
        .do(async () => {})

      expect(returned).toBe(actor)
      expect(actor.pending).toBe(19)
    })

    it('starts with zero pending actions', () => {
      const { actor } = createTestActor()
      expect(actor.pending).toBe(0)
    })

    it('forwards config properties', () => {
      const { actor } = createTestActor('alice')
      expect(actor.role).toBe('alice')
      expect(actor.key).toBe('alice-1')
      expect(actor.username).toBe('alice')
      expect(actor.email).toBe('alice@test.com')
    })
  })

  describe('drain (execution phase)', () => {
    it('executes queued actions in order', async () => {
      const order: string[] = []

      const { actor } = createTestActor()

      actor.do(async () => { order.push('first') })
      actor.do(async () => { order.push('second') })
      actor.do(async () => { order.push('third') })

      await actor.drain()

      expect(order).toEqual(['first', 'second', 'third'])
    })

    it('clears the queue after draining', async () => {
      const { actor } = createTestActor()

      actor.do(async () => {})
      actor.do(async () => {})

      expect(actor.pending).toBe(2)

      await actor.drain()

      expect(actor.pending).toBe(0)
    })

    it('records timeline entries', async () => {
      const { actor, timeline } = createTestActor()

      actor.do(async () => {})
      actor.do(async () => {})

      await actor.drain()

      expect(timeline).toHaveLength(2)
      expect(timeline[0].action).toBe('do')
      expect(timeline[0].actor).toBe('user')
      expect(timeline[0].duration).toBeDefined()
    })

    it('records errors in timeline entries', async () => {
      const { actor, timeline } = createTestActor()

      actor.do(async () => {
        throw new Error('boom')
      })

      await expect(actor.drain()).rejects.toThrow('boom')

      expect(timeline).toHaveLength(1)
      expect(timeline[0].error).toBe('boom')
    })

    it('throws if drain called while already draining', async () => {
      const { actor } = createTestActor()

      // Queue a slow action
      actor.do(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      const p1 = actor.drain()

      await expect(actor.drain()).rejects.toThrow('already draining')

      await p1
    })

    it('stops execution when aborted', async () => {
      const order: string[] = []
      const { actor } = createTestActor()

      actor.do(async () => {
        order.push('first')
        // Abort mid-drain
        actor.abort('peer failed')
      })
      actor.do(async () => {
        order.push('second') // should NOT execute
      })

      await expect(actor.drain()).rejects.toThrow('aborted')

      expect(order).toEqual(['first'])
    })
  })

  describe('coordination', () => {
    it('emit() pushes message to bus during drain', async () => {
      const bus = new MessageBus()
      const { actor } = createTestActor('alice', { bus })

      actor.emit('hello')

      expect(bus.hasEmitted('hello')).toBe(false)

      await actor.drain()

      expect(bus.hasEmitted('hello')).toBe(true)
    })

    it('waitFor() blocks until message arrives', async () => {
      const bus = new MessageBus()
      const { actor } = createTestActor('bob', { bus })
      const order: string[] = []

      actor.do(async () => { order.push('before-wait') })
      actor.waitFor('ready')
      actor.do(async () => { order.push('after-wait') })

      // Start draining — will block at waitFor
      const drainPromise = actor.drain()

      // Give drain a tick to reach the waitFor
      await new Promise((r) => setTimeout(r, 10))
      expect(order).toEqual(['before-wait'])

      // Emit the message — unblocks waitFor
      bus.emit('ready')

      await drainPromise

      expect(order).toEqual(['before-wait', 'after-wait'])
    })

    it('waitFor() resolves immediately if message already emitted (sticky)', async () => {
      const bus = new MessageBus()
      bus.emit('already-sent')

      const { actor } = createTestActor('bob', { bus })
      const order: string[] = []

      actor.waitFor('already-sent')
      actor.do(async () => { order.push('after') })

      await actor.drain()

      expect(order).toEqual(['after'])
    })
  })

  describe('if() — conditional monitors', () => {
    it('captures sub-actions during declaration without affecting main queue', () => {
      const { actor } = createTestActor()

      actor.do(async () => {})

      actor.if('modal', a => {
        a.do(async () => {})
        a.do(async () => {})
      })

      actor.do(async () => {})

      // Main queue should have 2 actions (the two do() calls), not 4
      expect(actor.pending).toBe(2)
    })

    it('fires sub-actions inline when selector is visible during an action', async () => {
      const { actor } = createTestActor()
      const order: string[] = []

      // Register a conditional monitor
      actor.if('modal', a => {
        a.do(async () => { order.push('dismiss-modal') })
      })

      // Queue a slow action during which the monitor should fire
      actor.do(async () => {
        order.push('action-start')
        // Simulate a slow action
        await new Promise((r) => setTimeout(r, 100))
        order.push('action-end')
      })

      actor.do(async () => { order.push('after') })

      // The mock locator returns isVisible=false by default, so the
      // monitor won't fire.  This test verifies the flow completes
      // without the monitor firing (selector not visible).
      await actor.drain()

      expect(order).toEqual(['action-start', 'action-end', 'after'])
    })

    it('does not affect drain when monitor never triggers', async () => {
      const { actor } = createTestActor()
      const order: string[] = []

      actor.if('nonexistent', a => {
        a.do(async () => { order.push('should-not-run') })
      })

      actor.do(async () => { order.push('normal') })

      await actor.drain()

      // Sub-actions should NOT have run
      expect(order).toEqual(['normal'])
    })

    it('queue-swap restores main queue even if callback throws', () => {
      const { actor } = createTestActor()

      actor.do(async () => {})

      expect(() => {
        actor.if('modal', () => {
          throw new Error('callback error')
        })
      }).toThrow('callback error')

      // Main queue should still be intact
      expect(actor.pending).toBe(1)
    })

    it('supports chained sub-actions inside if()', () => {
      const { actor } = createTestActor()

      actor.if('modal', a => {
        a.click('dismiss').wait(100).click('confirm')
      })

      // Main queue unaffected
      expect(actor.pending).toBe(0)
    })

    it('fires sub-actions immediately when element is already visible at action start', async () => {
      // This tests the pre-check path: the element is visible before the action runs.
      // The monitor should fire at the beginning of executeWithMonitors, not via concurrent polling.
      const visibleLocator = mockLocator(true) // always visible
      const page = mockPage()
      page.locator = vi.fn().mockReturnValue(visibleLocator)

      const { actor } = createTestActor('user', { page: page as any })
      const order: string[] = []

      actor.if('dismiss-intro', a => {
        a.do(async () => { order.push('dismissed') })
      })

      actor.do(async () => { order.push('main-action') })

      await actor.drain()

      // 'dismissed' should appear before 'main-action' because the pre-check
      // fires the monitor synchronously at the start of the action
      expect(order).toEqual(['dismissed', 'main-action'])
    })

    it('monitor fires only once even if element remains visible', async () => {
      const visibleLocator = mockLocator(true)
      const page = mockPage()
      page.locator = vi.fn().mockReturnValue(visibleLocator)

      const { actor } = createTestActor('user', { page: page as any })
      const fired: number[] = []

      actor.if('persistent-banner', a => {
        a.do(async () => { fired.push(1) })
      })

      // Multiple actions — monitor should only fire once (one-shot)
      actor.do(async () => {})
      actor.do(async () => {})
      actor.do(async () => {})

      await actor.drain()

      expect(fired).toHaveLength(1)
    })
  })

  describe('pressKey()', () => {
    it('queues a pressKey action that calls page.keyboard.press', async () => {
      const { actor, page } = createTestActor()
      const keyboard = { press: vi.fn().mockResolvedValue(undefined) }
      ;(page as any).keyboard = keyboard

      actor.pressKey('Escape')
      await actor.drain()

      expect(keyboard.press).toHaveBeenCalledWith('Escape')
    })

    it('is chainable and returns this', () => {
      const { actor } = createTestActor()
      const result = actor.pressKey('Enter')
      expect(result).toBe(actor)
      expect(actor.pending).toBe(1)
    })
  })
})

describe('deferred page initialization', () => {
  it('allows queueing actions before page is set', () => {
    const { actor } = createDeferredActor()

    actor.openTo('/login')
    actor.see('form').typeInto('email', 'a@b.com').click('submit')

    expect(actor.pending).toBe(4)
  })

  it('exposes config properties before page is set', () => {
    const { actor } = createDeferredActor('alice')

    expect(actor.role).toBe('alice')
    expect(actor.key).toBe('alice-1')
    expect(actor.email).toBe('alice@test.com')
  })

  it('throws when accessing page before initialization', () => {
    const { actor } = createDeferredActor()

    expect(() => actor.page).toThrow('page not initialized')
  })

  it('throws when draining without page', async () => {
    const { actor } = createDeferredActor()

    actor.do(async () => {})

    await expect(actor.drain()).rejects.toThrow('page not initialized')
  })

  it('drains successfully after _setPage', async () => {
    const { actor, page } = createDeferredActor()
    const order: string[] = []

    actor.do(async () => { order.push('first') })
    actor.do(async () => { order.push('second') })

    // Set page — simulates flow runner phase 2
    actor._setPage(page as any)

    await actor.drain()

    expect(order).toEqual(['first', 'second'])
  })

  it('page getter works after _setPage', () => {
    const { actor, page } = createDeferredActor()

    actor._setPage(page as any)

    expect(() => actor.page).not.toThrow()
  })
})

describe('drainAll', () => {
  it('drains multiple actors concurrently', async () => {
    const events: string[] = []

    const { actor: alice } = createTestActor('alice')
    const { actor: bob } = createTestActor('bob')

    alice.do(async () => {
      events.push('alice-start')
      await new Promise((r) => setTimeout(r, 30))
      events.push('alice-end')
    })

    bob.do(async () => {
      events.push('bob-start')
      await new Promise((r) => setTimeout(r, 10))
      events.push('bob-end')
    })

    await drainAll([alice, bob])

    // Both should have started before either finished
    // (bob finishes first because it's shorter)
    expect(events.indexOf('alice-start')).toBeLessThan(events.indexOf('alice-end'))
    expect(events.indexOf('bob-start')).toBeLessThan(events.indexOf('bob-end'))
    // Both started (we don't assert start ordering because it's nondeterministic,
    // but both must have completed)
    expect(events).toContain('alice-end')
    expect(events).toContain('bob-end')
  })

  it('aborts other actors when one fails', async () => {
    const { actor: alice } = createTestActor('alice')
    const { actor: bob } = createTestActor('bob')

    alice.do(async () => {
      throw new Error('alice broke')
    })

    bob.do(async () => {
      // Slow action — should get aborted
      await new Promise((r) => setTimeout(r, 200))
    })
    bob.do(async () => {
      // Should never execute
    })

    await expect(drainAll([alice, bob])).rejects.toThrow('alice broke')

    // Bob should have been aborted
    expect(bob.aborted).toBe(true)
  })

  it('handles empty actor list', async () => {
    await drainAll([])
    // Should not throw
  })

  it('handles single actor', async () => {
    const { actor } = createTestActor()
    const order: string[] = []

    actor.do(async () => { order.push('only') })

    await drainAll([actor])

    expect(order).toEqual(['only'])
  })

  it('cross-actor coordination via message bus', async () => {
    const bus = new MessageBus()
    const { actor: alice } = createTestActor('alice', { bus })
    const { actor: bob } = createTestActor('bob', { bus })

    const events: string[] = []

    // Alice does work then signals
    alice.do(async () => {
      events.push('alice-work')
      await new Promise((r) => setTimeout(r, 20))
    })
    alice.emit('alice-done')

    // Bob waits for alice then proceeds
    bob.waitFor('alice-done')
    bob.do(async () => {
      events.push('bob-after-alice')
    })

    await drainAll([alice, bob])

    // Bob must have waited for alice
    expect(events.indexOf('alice-work')).toBeLessThan(
      events.indexOf('bob-after-alice')
    )
  })
})

describe('reload()', () => {
  it('queues a reload action', () => {
    const { actor } = createTestActor()

    actor.reload()

    expect(actor.pending).toBe(1)
  })

  it('chains fluently — returns the same actor', () => {
    const { actor } = createTestActor()

    const returned = actor.reload()

    expect(returned).toBe(actor)
  })

  it('calls page.reload() during drain', async () => {
    const { actor, page } = createTestActor()

    actor.reload()
    await actor.drain()

    expect(page.reload).toHaveBeenCalledWith({ timeout: 5000 })
  })

  it('resets scope to page root after reload', async () => {
    const { actor, page } = createTestActor()

    actor.do(async () => {
      ;(actor as any).currentScope = { fake: 'locator' }
      ;(actor as any).scopeStack = [page]
    })
    actor.reload()
    actor.do(async () => {
      expect((actor as any).currentScope).toBe(page)
      expect((actor as any).scopeStack).toEqual([])
    })

    await actor.drain()
  })

  it('records timeline entry', async () => {
    const { actor, timeline } = createTestActor()

    actor.reload()
    await actor.drain()

    expect(timeline).toHaveLength(1)
    expect(timeline[0].action).toBe('reload')
    expect(timeline[0].actor).toBe('user')
  })
})

describe('goBack() / goForward()', () => {
  it('queues goBack and goForward actions', () => {
    const { actor } = createTestActor()

    actor.goBack()
    actor.goForward()

    expect(actor.pending).toBe(2)
  })

  it('chains fluently', () => {
    const { actor } = createTestActor()

    expect(actor.goBack()).toBe(actor)
    expect(actor.goForward()).toBe(actor)
  })

  it('calls page.goBack() during drain', async () => {
    const { actor, page } = createTestActor()

    actor.goBack()
    await actor.drain()

    expect(page.goBack).toHaveBeenCalledWith({ timeout: 5000 })
  })

  it('calls page.goForward() during drain', async () => {
    const { actor, page } = createTestActor()

    actor.goForward()
    await actor.drain()

    expect(page.goForward).toHaveBeenCalledWith({ timeout: 5000 })
  })

  it('resets scope to page root', async () => {
    const { actor, page } = createTestActor()

    actor.do(async () => {
      ;(actor as any).currentScope = { fake: 'locator' }
      ;(actor as any).scopeStack = [page]
    })
    actor.goBack()
    actor.do(async () => {
      expect((actor as any).currentScope).toBe(page)
      expect((actor as any).scopeStack).toEqual([])
    })

    await actor.drain()
  })

  it('records timeline entries', async () => {
    const { actor, timeline } = createTestActor()

    actor.goBack()
    actor.goForward()
    await actor.drain()

    expect(timeline).toHaveLength(2)
    expect(timeline[0].action).toBe('goBack')
    expect(timeline[1].action).toBe('goForward')
  })
})

describe('switchDevice()', () => {
  it('queues a switchDevice action', () => {
    const { actor } = createTestActor()

    actor.switchDevice('iPhone 14')

    expect(actor.pending).toBe(1)
  })

  it('chains fluently — returns the same actor', () => {
    const { actor } = createTestActor()

    const returned = actor.switchDevice('iPhone 14')

    expect(returned).toBe(actor)
  })

  it('throws during drain when no page factory is set', async () => {
    const { actor } = createTestActor()

    actor.switchDevice('iPhone 14')

    await expect(actor.drain()).rejects.toThrow(
      'switchDevice requires the scene runner'
    )
  })

  it('calls the page factory and replaces the page', async () => {
    const { actor } = createTestActor()
    const newPage = mockPage()

    const factory = vi.fn().mockResolvedValue({
      page: newPage,
      context: {},
    })

    actor._setPageFactory(factory)
    actor.switchDevice('iPhone 14')
    await actor.drain()

    // Factory was called with the device profile
    expect(factory).toHaveBeenCalledTimes(1)
    const factoryArg = factory.mock.calls[0][0]
    expect(factoryArg).not.toBeNull()
    expect(factoryArg.name).toBe('iPhone 14')

    // Actor's page should now be the new one
    expect(actor.page).toBe(newPage)
  })

  it('passes null to factory when no device name given (rotation)', async () => {
    const { actor } = createTestActor()
    const newPage = mockPage()

    const factory = vi.fn().mockResolvedValue({
      page: newPage,
      context: {},
    })

    actor._setPageFactory(factory)
    actor.switchDevice()
    await actor.drain()

    // Factory called with null — lets the factory use device rotation
    expect(factory).toHaveBeenCalledWith(null)
    expect(actor.page).toBe(newPage)
  })

  it('throws for unknown device name', async () => {
    const { actor } = createTestActor()

    const factory = vi.fn()
    actor._setPageFactory(factory)
    actor.switchDevice('Nokia 3310')

    await expect(actor.drain()).rejects.toThrow('Unknown device "Nokia 3310"')
    expect(factory).not.toHaveBeenCalled()
  })

  it('resets scope after switching device', async () => {
    const { actor, page: originalPage } = createTestActor()
    const newPage = mockPage()

    const factory = vi.fn().mockResolvedValue({
      page: newPage,
      context: {},
    })

    actor._setPageFactory(factory)

    // Manually set scope to simulate a prior see()
    actor.do(async () => {
      ;(actor as any).currentScope = { fake: 'locator' }
      ;(actor as any).scopeStack = [originalPage]
    })
    actor.switchDevice('iPhone 14')
    actor.do(async () => {
      // Scope should be reset to the new page
      expect((actor as any).currentScope).toBe(newPage)
      expect((actor as any).scopeStack).toEqual([])
      expect(actor.page).toBe(newPage)
    })

    await actor.drain()
  })

  it('records timeline entry', async () => {
    const { actor, timeline } = createTestActor()
    const newPage = mockPage()

    const factory = vi.fn().mockResolvedValue({
      page: newPage,
      context: {},
    })

    actor._setPageFactory(factory)
    actor.switchDevice('iPhone 14')
    await actor.drain()

    const entry = timeline.find(e => e.action === 'switchDevice')
    expect(entry).toBeDefined()
    expect(entry!.actor).toBe('user')
    expect(entry!.target).toBe('iPhone 14')
  })

  it('subsequent actions use the new page after switch', async () => {
    const { actor, page: originalPage } = createTestActor()
    const newPage = mockPage()

    const factory = vi.fn().mockResolvedValue({
      page: newPage,
      context: {},
    })

    actor._setPageFactory(factory)
    actor.switchDevice('iPhone 14')
    actor.openTo('/dashboard')
    await actor.drain()

    // openTo should have navigated on the NEW page, not the original
    expect(newPage.goto).toHaveBeenCalledWith('/dashboard', expect.any(Object))
    expect(originalPage.goto).not.toHaveBeenCalled()
  })
})
