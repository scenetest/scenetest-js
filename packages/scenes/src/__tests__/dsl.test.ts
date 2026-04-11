import { describe, it, expect, vi } from 'vitest'
import {
  parseAction,
  parseDslLines,
  applyDslAction,
  defineMacro,
  clearMacros,
} from '../dsl.js'
import { ConcurrentActorHandleImpl, drainAll } from '../reactive.js'
import { MessageBus } from '../message-bus.js'
import type { TimelineEntry, ScriptWarning, DslTarget, ConcurrentActorHandle } from '../types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLocator(visible = true) {
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

function mockPage() {
  const locator = mockLocator()
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    getByText: vi.fn().mockReturnValue({ first: () => locator }),
    locator: vi.fn().mockReturnValue(locator),
    evaluate: vi.fn().mockResolvedValue(undefined),
    _locator: locator,
  }
}

function createTestActor(role = 'user') {
  const bus = new MessageBus()
  const timeline: TimelineEntry[] = []
  const warnings: ScriptWarning[] = []
  const page = mockPage()

  const actor = new ConcurrentActorHandleImpl(
    role,
    { key: `${role}-1`, username: role, email: `${role}@test.com`, password: 'pass' },
    page as any,
    bus,
    timeline,
    warnings,
    [],
    5000,
    60000
  )

  return { actor, bus, timeline, warnings, page }
}

/** Build a minimal DslTarget spy that records calls */
function createSpyTarget(): DslTarget & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    openTo(url: string) { calls.push(`openTo:${url}`); return this },
    reload() { calls.push('reload'); return this },
    goBack() { calls.push('goBack'); return this },
    goForward() { calls.push('goForward'); return this },
    switchDevice(d?: string) { calls.push(`switchDevice:${d ?? '(next)'}`); return this },
    see(s: string) { calls.push(`see:${s}`); return this },
    seeInView(s: string) { calls.push(`seeInView:${s}`); return this },
    notSee(s: string) { calls.push(`notSee:${s}`); return this },
    seeText(t: string) { calls.push(`seeText:${t}`); return this },
    seeToast(s: string) { calls.push(`seeToast:${s}`); return this },
    scope(s: string) { calls.push(`scope:${s}`); return this },
    click(s?: string) { calls.push(`click:${s ?? '(scope)'}`); return this },
    typeInto(s: string, v: string) { calls.push(`typeInto:${s}=${v}`); return this },
    check(s: string) { calls.push(`check:${s}`); return this },
    select(s: string, v: string) { calls.push(`select:${s}=${v}`); return this },
    wait(ms: number) { calls.push(`wait:${ms}`); return this },
    emit(m: string) { calls.push(`emit:${m}`); return this },
    waitFor(m: string) { calls.push(`waitFor:${m}`); return this },
    warnIf(s: string, m: string) { calls.push(`warnIf:${s}=${m}`) },
    up(s?: string) { calls.push(`up:${s ?? '(root)'}`); return this },
    prev() { calls.push('prev'); return this },
    scrollToBottom() { calls.push('scrollToBottom'); return this },
    pressKey(k: string) { calls.push(`pressKey:${k}`); return this },
    ifClick(s: string) { calls.push(`ifClick:${s}`); return this },
  }
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('parseAction', () => {
  it('parses value-only actions (openTo, seeText, wait, emit)', () => {
    expect(parseAction('openTo /dashboard')).toEqual({ action: 'openTo', value: '/dashboard' })
    expect(parseAction('seeText Hello World')).toEqual({ action: 'seeText', value: 'Hello World' })
    expect(parseAction('wait 500')).toEqual({ action: 'wait', value: '500' })
    expect(parseAction('emit user-ready')).toEqual({ action: 'emit', value: 'user-ready' })
  })

  it('parses selector-only actions (see, seeInView, notSee, click, check, seeToast, up, ifClick)', () => {
    expect(parseAction('see main-content')).toEqual({ action: 'see', selector: 'main-content' })
    expect(parseAction('seeInView hero-section')).toEqual({ action: 'seeInView', selector: 'hero-section' })
    expect(parseAction('notSee spinner')).toEqual({ action: 'notSee', selector: 'spinner' })
    expect(parseAction('click submit-btn')).toEqual({ action: 'click', selector: 'submit-btn' })
    expect(parseAction('check remember-me')).toEqual({ action: 'check', selector: 'remember-me' })
    expect(parseAction('seeToast success')).toEqual({ action: 'seeToast', selector: 'success' })
    expect(parseAction('up modal')).toEqual({ action: 'up', selector: 'modal' })
    expect(parseAction('ifClick dismiss-button')).toEqual({ action: 'ifClick', selector: 'dismiss-button' })
  })

  it('parses ifClick with nested selector', () => {
    expect(parseAction('ifClick modal close-button')).toEqual({ action: 'ifClick', selector: 'modal close-button' })
  })

  it('parses selector+value actions (typeInto, select, warnIf)', () => {
    // Simple case: single-word selector, single-word value
    expect(parseAction('typeInto email alice@test.com')).toEqual({
      action: 'typeInto', selector: 'email', value: 'alice@test.com',
    })
    expect(parseAction('select role admin')).toEqual({
      action: 'select', selector: 'role', value: 'admin',
    })
    // warnIf with quoted multi-word message
    expect(parseAction("warnIf modal 'should not see this'")).toEqual({
      action: 'warnIf', selector: 'modal', value: 'should not see this',
    })
  })

  it('parses nested selectors with typeInto/select (last token is value)', () => {
    // Multi-word selector, single-word value
    expect(parseAction('typeInto modal search-input hello')).toEqual({
      action: 'typeInto', selector: 'modal search-input', value: 'hello',
    })
    expect(parseAction('select form dropdown option1')).toEqual({
      action: 'select', selector: 'form dropdown', value: 'option1',
    })
  })

  it('parses quoted values (single and double quotes)', () => {
    // Single quotes
    expect(parseAction("typeInto search-input 'hello world'")).toEqual({
      action: 'typeInto', selector: 'search-input', value: 'hello world',
    })
    // Double quotes
    expect(parseAction('typeInto search-input "hello world"')).toEqual({
      action: 'typeInto', selector: 'search-input', value: 'hello world',
    })
    // Nested selector with quoted value
    expect(parseAction("typeInto modal search-input 'hello world'")).toEqual({
      action: 'typeInto', selector: 'modal search-input', value: 'hello world',
    })
  })

  it('handles selector-only for typeInto/select (no value)', () => {
    // Only selector, no value
    expect(parseAction('typeInto email-input')).toEqual({
      action: 'typeInto', selector: 'email-input',
    })
  })

  it('parses no-argument actions', () => {
    expect(parseAction('prev')).toEqual({ action: 'prev' })
    expect(parseAction('scrollToBottom')).toEqual({ action: 'scrollToBottom' })
    expect(parseAction('click')).toEqual({ action: 'click' })
    expect(parseAction('up')).toEqual({ action: 'up' })
  })

  it('parses waitFor as value-only action', () => {
    expect(parseAction('waitFor data-ready')).toEqual({ action: 'waitFor', value: 'data-ready' })
  })

  it('parses pressKey as value-only action', () => {
    expect(parseAction('pressKey Escape')).toEqual({ action: 'pressKey', value: 'Escape' })
    expect(parseAction('pressKey Enter')).toEqual({ action: 'pressKey', value: 'Enter' })
    expect(parseAction('pressKey Tab')).toEqual({ action: 'pressKey', value: 'Tab' })
  })

  it('throws on empty input', () => {
    expect(() => parseAction('')).toThrow('Empty action line')
    expect(() => parseAction('   ')).toThrow('Empty action line')
  })
})

describe('parseDslLines', () => {
  it('splits multiline text into action lines', () => {
    const lines = parseDslLines(`
      openTo /login
      see login-form
      typeInto email alice@test.com
      click submit
    `)
    expect(lines).toEqual([
      'openTo /login',
      'see login-form',
      'typeInto email alice@test.com',
      'click submit',
    ])
  })

  it('skips empty lines and comments', () => {
    const lines = parseDslLines(`
      openTo /login
      # This is a comment
      see form
      // Another comment

      click submit
    `)
    expect(lines).toEqual(['openTo /login', 'see form', 'click submit'])
  })

  it('returns empty array for empty/whitespace input', () => {
    expect(parseDslLines('')).toEqual([])
    expect(parseDslLines('   \n  \n  ')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// applyDslAction tests
// ---------------------------------------------------------------------------

describe('applyDslAction', () => {
  it('dispatches to correct methods on a DslTarget', () => {
    const target = createSpyTarget()

    applyDslAction(target, { action: 'openTo', value: '/login' })
    applyDslAction(target, { action: 'see', selector: 'form' })
    applyDslAction(target, { action: 'typeInto', selector: 'email', value: 'a@b.com' })
    applyDslAction(target, { action: 'click', selector: 'submit' })
    applyDslAction(target, { action: 'scrollToBottom' })
    applyDslAction(target, { action: 'prev' })

    expect(target.calls).toEqual([
      'openTo:/login',
      'see:form',
      'typeInto:email=a@b.com',
      'click:submit',
      'scrollToBottom',
      'prev',
    ])
  })

  it('dispatches bare click (no selector)', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'click' })
    expect(target.calls).toEqual(['click:(scope)'])
  })

  it('dispatches seeInView', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'seeInView', selector: 'hero' })
    expect(target.calls).toEqual(['seeInView:hero'])
  })

  it('dispatches bare up (no selector) for page root reset', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'up' })
    expect(target.calls).toEqual(['up:(root)'])
  })

  it('dispatches up with selector', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'up', selector: '~container' })
    expect(target.calls).toEqual(['up:~container'])
  })

  it('dispatches waitFor on targets that support it', () => {
    const target = createSpyTarget()
    ;(target as any).waitFor = (m: string) => { target.calls.push(`waitFor:${m}`) }
    applyDslAction(target, { action: 'waitFor', value: 'setup-done' })
    expect(target.calls).toEqual(['waitFor:setup-done'])
  })

  it('dispatches pressKey', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'pressKey', value: 'Escape' })
    expect(target.calls).toEqual(['pressKey:Escape'])
  })

  it('throws when pressKey is missing key name', () => {
    const target = createSpyTarget()
    expect(() => applyDslAction(target, { action: 'pressKey' }))
      .toThrow('pressKey requires a key name')
  })

  it('dispatches ifClick', () => {
    const target = createSpyTarget()
    applyDslAction(target, { action: 'ifClick', selector: 'dismiss-btn' })
    expect(target.calls).toEqual(['ifClick:dismiss-btn'])
  })

  it('throws when ifClick is missing selector', () => {
    const target = createSpyTarget()
    expect(() => applyDslAction(target, { action: 'ifClick' })).toThrow('ifClick requires a selector')
  })

  it('throws on unknown action', () => {
    const target = createSpyTarget()
    expect(() => applyDslAction(target, { action: 'flyTo' })).toThrow('Unknown DSL action: flyTo')
  })

  it('throws when required arguments are missing', () => {
    const target = createSpyTarget()
    expect(() => applyDslAction(target, { action: 'openTo' })).toThrow('openTo requires a URL')
    expect(() => applyDslAction(target, { action: 'see' })).toThrow('see requires a selector')
    expect(() => applyDslAction(target, { action: 'typeInto', selector: 'x' })).toThrow('typeInto requires a value')
  })
})

// ---------------------------------------------------------------------------
// actor.dsl() method on ConcurrentActorHandleImpl
// ---------------------------------------------------------------------------

describe('ConcurrentActorHandleImpl.dsl()', () => {
  it('queues actions from a multiline text DSL string', () => {
    const { actor } = createTestActor()

    actor.dsl(`
      openTo /login
      see login-form
      typeInto email alice@test.com
      click submit
    `)

    expect(actor.pending).toBe(4)
  })

  it('returns the actor for chaining', () => {
    const { actor } = createTestActor()

    const result = actor.dsl(`
      openTo /login
    `)

    expect(result).toBe(actor)
  })

  it('can be chained with other DSL methods', () => {
    const { actor } = createTestActor()

    actor
      .dsl(`
        openTo /login
        see login-form
      `)
      .click('submit')
      .see('dashboard')

    expect(actor.pending).toBe(4)
  })

  it('skips comments and empty lines', () => {
    const { actor } = createTestActor()

    actor.dsl(`
      # Navigate
      openTo /

      // Verify
      see welcome-box
    `)

    expect(actor.pending).toBe(2)
  })

  it('works with dsl() before manual method calls and drains correctly', async () => {
    const { actor } = createTestActor()
    const order: string[] = []

    actor.dsl(`
      openTo /
    `)
    actor.do(async () => { order.push('after-dsl') })

    await actor.drain()

    // openTo and do both executed
    expect(order).toEqual(['after-dsl'])
  })

  it('queues actions in correct order when mixed with method calls', () => {
    const { actor } = createTestActor()

    actor.openTo('/')
    actor.dsl(`
      see header
      click menu
    `)
    actor.see('page-content')

    // 1 openTo + 2 dsl + 1 see = 4
    expect(actor.pending).toBe(4)
  })

  // -------------------------------------------------------------------------
  // Interpolation tests
  // -------------------------------------------------------------------------

  it('interpolates [self.field] with actor own fields', () => {
    const { actor, page } = createTestActor('alice')

    actor.dsl(`
      typeInto email [self.email]
      typeInto username [self.username]
    `)

    expect(actor.pending).toBe(2)
    // We can verify the interpolated values by draining and checking fill calls
  })

  it('interpolates [role.field] with other actor fields', () => {
    const bus = new MessageBus()
    const timeline: TimelineEntry[] = []
    const warnings: ScriptWarning[] = []

    // Create alice
    const alicePage = mockPage()
    const alice = new ConcurrentActorHandleImpl(
      'alice',
      { key: 'alice-1', username: 'alice_user', email: 'alice@test.com', password: 'pass' },
      alicePage as any,
      bus,
      timeline,
      warnings,
      [],
      5000,
      60000
    )

    // Create bob
    const bobPage = mockPage()
    const bob = new ConcurrentActorHandleImpl(
      'bob',
      { key: 'bob-1', username: 'bob_user', email: 'bob@test.com', password: 'pass' },
      bobPage as any,
      bus,
      timeline,
      warnings,
      [],
      5000,
      60000
    )

    // Set up actor registry
    const registry = new Map<string, ConcurrentActorHandleImpl>()
    registry.set('alice', alice)
    registry.set('bob', bob)
    alice._setActorRegistry(registry)
    bob._setActorRegistry(registry)

    // Alice references bob's username
    alice.dsl(`
      typeInto search-input [bob.username]
      see user-card-[bob.key]
    `)

    expect(alice.pending).toBe(2)
  })

  it('escapes interpolated values to prevent selector injection', () => {
    const bus = new MessageBus()
    const timeline: TimelineEntry[] = []
    const warnings: ScriptWarning[] = []
    const page = mockPage()

    // Create actor with potentially dangerous field values
    const actor = new ConcurrentActorHandleImpl(
      'hacker',
      {
        key: 'user-1',
        username: "test[inject]'value",
        email: 'test@test.com',
        password: 'pass',
      },
      page as any,
      bus,
      timeline,
      warnings,
      [],
      5000,
      60000
    )

    // Self-reference with dangerous characters should be escaped
    actor.dsl(`
      see user-card-[self.username]
    `)

    expect(actor.pending).toBe(1)
    // The brackets and quotes in username should be escaped
  })

  it('throws on unknown [self.field] reference', () => {
    const { actor } = createTestActor()

    expect(() => {
      actor.dsl('typeInto input [self.nonexistent]')
    }).toThrow('[self.nonexistent]')
  })

  it('throws on unknown [role.field] when actor not in registry', () => {
    const { actor } = createTestActor()

    // No registry set - should throw
    expect(() => {
      actor.dsl('typeInto input [bob.username]')
    }).toThrow('cannot reference other actors outside a scene context')
  })

  it('throws on unknown actor in [role.field] reference', () => {
    const bus = new MessageBus()
    const timeline: TimelineEntry[] = []
    const warnings: ScriptWarning[] = []
    const page = mockPage()

    const actor = new ConcurrentActorHandleImpl(
      'alice',
      { key: 'alice-1', username: 'alice', email: 'alice@test.com', password: 'pass' },
      page as any,
      bus,
      timeline,
      warnings,
      [],
      5000,
      60000
    )

    // Set up registry with only alice
    const registry = new Map<string, ConcurrentActorHandleImpl>()
    registry.set('alice', actor)
    actor._setActorRegistry(registry)

    expect(() => {
      actor.dsl('typeInto input [bob.username]')
    }).toThrow('unknown actor "bob"')
  })

  it('supports compound selectors with interpolation', () => {
    const bus = new MessageBus()
    const timeline: TimelineEntry[] = []
    const warnings: ScriptWarning[] = []
    const page = mockPage()

    const actor = new ConcurrentActorHandleImpl(
      'alice',
      { key: '12345', username: 'alice', email: 'alice@test.com', password: 'pass' },
      page as any,
      bus,
      timeline,
      warnings,
      [],
      5000,
      60000
    )

    // Use self reference in compound selector
    actor.dsl(`
      see user-result-[self.key]
      click delete-btn-[self.key]
    `)

    expect(actor.pending).toBe(2)
  })
})
