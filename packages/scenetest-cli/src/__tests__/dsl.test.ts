import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseAction,
  parseDslLines,
  applyDslAction,
  runDsl,
  defineMacro,
  runMacro,
  clearMacros,
} from '../dsl.js'
import { ReactiveActorHandle, drainAll } from '../reactive.js'
import { MessageBus } from '../message-bus.js'
import type { TimelineEntry, ScriptWarning, DslTarget } from '../types.js'

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

  const actor = new ReactiveActorHandle(
    role,
    { id: `${role}-1`, username: role, email: `${role}@test.com`, password: 'pass' },
    page as any,
    bus,
    timeline,
    warnings,
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
    see(s: string) { calls.push(`see:${s}`); return this },
    notSee(s: string) { calls.push(`notSee:${s}`); return this },
    seeText(t: string) { calls.push(`seeText:${t}`); return this },
    seeToast(s: string) { calls.push(`seeToast:${s}`); return this },
    click(s: string) { calls.push(`click:${s}`); return this },
    typeInto(s: string, v: string) { calls.push(`typeInto:${s}=${v}`); return this },
    check(s: string) { calls.push(`check:${s}`); return this },
    select(s: string, v: string) { calls.push(`select:${s}=${v}`); return this },
    wait(ms: number) { calls.push(`wait:${ms}`); return this },
    emit(m: string) { calls.push(`emit:${m}`); return this },
    warnIf(s: string, m: string) { calls.push(`warnIf:${s}=${m}`) },
    up(s: string) { calls.push(`up:${s}`); return this },
    prev() { calls.push('prev'); return this },
    scrollToBottom() { calls.push('scrollToBottom'); return this },
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

  it('parses selector-only actions (see, notSee, click, check, seeToast, up)', () => {
    expect(parseAction('see main-content')).toEqual({ action: 'see', selector: 'main-content' })
    expect(parseAction('notSee spinner')).toEqual({ action: 'notSee', selector: 'spinner' })
    expect(parseAction('click submit-btn')).toEqual({ action: 'click', selector: 'submit-btn' })
    expect(parseAction('check remember-me')).toEqual({ action: 'check', selector: 'remember-me' })
    expect(parseAction('seeToast success')).toEqual({ action: 'seeToast', selector: 'success' })
    expect(parseAction('up modal')).toEqual({ action: 'up', selector: 'modal' })
  })

  it('parses selector+value actions (typeInto, select, warnIf)', () => {
    expect(parseAction('typeInto email alice@test.com')).toEqual({
      action: 'typeInto', selector: 'email', value: 'alice@test.com',
    })
    expect(parseAction('select role admin')).toEqual({
      action: 'select', selector: 'role', value: 'admin',
    })
    expect(parseAction('warnIf modal should not see this')).toEqual({
      action: 'warnIf', selector: 'modal', value: 'should not see this',
    })
  })

  it('parses no-argument actions', () => {
    expect(parseAction('prev')).toEqual({ action: 'prev' })
    expect(parseAction('scrollToBottom')).toEqual({ action: 'scrollToBottom' })
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
// runDsl with DslTarget spy
// ---------------------------------------------------------------------------

describe('runDsl', () => {
  it('works with a plain DslTarget (structural typing)', async () => {
    const target = createSpyTarget()

    await runDsl(target, [
      'openTo /login',
      'see form',
      'typeInto email a@b.com',
      'click submit',
    ])

    expect(target.calls).toEqual([
      'openTo:/login',
      'see:form',
      'typeInto:email=a@b.com',
      'click:submit',
    ])
  })

  it('skips comments and empty lines', async () => {
    const target = createSpyTarget()

    await runDsl(target, [
      '# Login flow',
      'openTo /login',
      '',
      '// Fill form',
      'see form',
    ])

    expect(target.calls).toEqual(['openTo:/login', 'see:form'])
  })
})

// ---------------------------------------------------------------------------
// runDsl / runMacro with ReactiveActorHandle
// ---------------------------------------------------------------------------

describe('runDsl with ReactiveActorHandle', () => {
  it('queues actions on a reactive actor', async () => {
    const { actor } = createTestActor()

    // runDsl awaits each applyDslAction call — on reactive actors,
    // the methods return `this` (non-thenable), so await is a no-op.
    // The actions get queued synchronously.
    await runDsl(actor, [
      'openTo /login',
      'see form',
      'click submit',
    ])

    expect(actor.pending).toBe(3)
  })
})

describe('runMacro with ReactiveActorHandle', () => {
  beforeEach(() => {
    clearMacros()
  })

  it('substitutes variables and queues actions', async () => {
    defineMacro('login', [
      'openTo /login',
      'see login-form',
      'typeInto email {{email}}',
      'typeInto password {{password}}',
      'click submit',
    ])

    const { actor } = createTestActor()

    await runMacro(actor, 'login', {
      email: 'alice@test.com',
      password: 'secret',
    })

    expect(actor.pending).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// actor.dsl() method on ReactiveActorHandle
// ---------------------------------------------------------------------------

describe('ReactiveActorHandle.dsl()', () => {
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
})
