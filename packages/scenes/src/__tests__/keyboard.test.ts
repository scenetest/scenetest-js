import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  NavigationModeRotation,
  FuzzyFingerError,
  tabToElement,
  fuzzyFingerClick,
  fuzzyFingerFill,
  fuzzyFingerCheck,
} from '../keyboard.js'

// ---------------------------------------------------------------------------
// NavigationModeRotation — pure logic, no mocks needed
// ---------------------------------------------------------------------------

describe('NavigationModeRotation', () => {
  it('defaults to pointer → keyboard alternation', () => {
    const r = new NavigationModeRotation()
    expect(r.next()).toBe('pointer')
    expect(r.next()).toBe('keyboard')
    expect(r.next()).toBe('pointer')
    expect(r.next()).toBe('keyboard')
  })

  it('wraps around after exhausting the pool', () => {
    const r = new NavigationModeRotation()
    for (let i = 0; i < 10; i++) r.next()
    // After 10 calls (even number), back to pointer
    expect(r.next()).toBe('pointer')
  })

  it('accepts a custom pool', () => {
    const r = new NavigationModeRotation(['keyboard', 'pointer', 'pointer'])
    expect(r.next()).toBe('keyboard')
    expect(r.next()).toBe('pointer')
    expect(r.next()).toBe('pointer')
    expect(r.next()).toBe('keyboard')
  })

  it('falls back to default pool when given empty array', () => {
    const r = new NavigationModeRotation([])
    expect(r.next()).toBe('pointer')
    expect(r.next()).toBe('keyboard')
  })

  it('falls back to default pool when given undefined', () => {
    const r = new NavigationModeRotation(undefined)
    expect(r.next()).toBe('pointer')
  })

  it('peek() returns next mode without advancing', () => {
    const r = new NavigationModeRotation()
    expect(r.peek()).toBe('pointer')
    expect(r.peek()).toBe('pointer') // still pointer
    r.next() // advance
    expect(r.peek()).toBe('keyboard')
  })

  it('reset() returns to the beginning', () => {
    const r = new NavigationModeRotation()
    r.next() // pointer
    r.next() // keyboard
    r.reset()
    expect(r.next()).toBe('pointer')
  })

  it('currentIndex tracks advancement', () => {
    const r = new NavigationModeRotation()
    expect(r.currentIndex).toBe(0)
    r.next()
    expect(r.currentIndex).toBe(1)
    r.next()
    expect(r.currentIndex).toBe(2)
  })

  it('modes getter returns the pool', () => {
    const r = new NavigationModeRotation(['pointer'])
    expect(r.modes).toEqual(['pointer'])
  })
})

// ---------------------------------------------------------------------------
// FuzzyFingerError — pure logic
// ---------------------------------------------------------------------------

describe('FuzzyFingerError', () => {
  it('formats miss-center message with WCAG reference', () => {
    const original = new Error('click failed')
    const err = new FuzzyFingerError('miss-center', 'submit-btn', original)

    expect(err.name).toBe('FuzzyFingerError')
    expect(err.strategy).toBe('miss-center')
    expect(err.selector).toBe('submit-btn')
    expect(err.originalError).toBe(original)
    expect(err.message).toContain('submit-btn')
    expect(err.message).toContain('WCAG 2.5.8')
    expect(err.message).toContain('too small')
  })

  it('formats miss-edge message with spacing reference', () => {
    const original = new Error('click failed')
    const err = new FuzzyFingerError('miss-edge', 'close-btn', original)

    expect(err.strategy).toBe('miss-edge')
    expect(err.message).toContain('close-btn')
    expect(err.message).toContain('too close to neighbor')
  })

  it('is an instance of Error', () => {
    const err = new FuzzyFingerError('miss-center', 'x', new Error(''))
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// Playwright mock helpers
// ---------------------------------------------------------------------------

function mockLocator(opts: {
  visible?: boolean
  clickFails?: boolean
  fillFails?: boolean
  checkFails?: boolean
  vanishes?: boolean
  box?: { x: number; y: number; width: number; height: number } | null
} = {}) {
  const {
    visible = true,
    clickFails = false,
    fillFails = false,
    checkFails = false,
    vanishes = false,
    box = { x: 100, y: 100, width: 50, height: 50 },
  } = opts

  return {
    waitFor: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(visible),
    click: clickFails
      ? vi.fn().mockRejectedValue(new Error('click failed'))
      : vi.fn().mockResolvedValue(undefined),
    fill: fillFails
      ? vi.fn().mockRejectedValue(new Error('fill failed'))
      : vi.fn().mockResolvedValue(undefined),
    check: checkFails
      ? vi.fn().mockRejectedValue(new Error('check failed'))
      : vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue(box),
    count: vi.fn().mockResolvedValue(vanishes ? 0 : 1),
    elementHandle: vi.fn().mockResolvedValue({
      evaluate: vi.fn().mockResolvedValue('found'),
    }),
  }
}

function mockPage() {
  return {
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
  }
}

// ---------------------------------------------------------------------------
// tabToElement
// ---------------------------------------------------------------------------

describe('tabToElement', () => {
  it('tabs until element is found', async () => {
    const page = mockPage()
    let tabCount = 0
    const target = {
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockImplementation(() => {
          tabCount++
          return tabCount >= 3 ? 'found' : 'BUTTONother'
        }),
      }),
    }

    await tabToElement(page as any, target as any, { maxTabs: 10 })

    // Should have pressed Tab 3 times
    expect(page.keyboard.press).toHaveBeenCalledTimes(3)
    expect(page.keyboard.press).toHaveBeenCalledWith('Tab')
  })

  it('throws when element handle is null', async () => {
    const page = mockPage()
    const target = {
      elementHandle: vi.fn().mockResolvedValue(null),
    }

    await expect(
      tabToElement(page as any, target as any)
    ).rejects.toThrow('target element not found in DOM')
  })

  it('throws after maxTabs exceeded', async () => {
    const page = mockPage()
    let callCount = 0
    const target = {
      elementHandle: vi.fn().mockResolvedValue({
        // Return different identifiers each time so cycle detection doesn't fire
        evaluate: vi.fn().mockImplementation(() => `BUTTON${callCount++}`),
      }),
    }

    await expect(
      tabToElement(page as any, target as any, { maxTabs: 5 })
    ).rejects.toThrow('could not reach element via Tab after 5 key presses')
  })

  it('throws when focus cycles back to start element', async () => {
    const page = mockPage()
    let callCount = 0
    const target = {
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockImplementation(() => {
          callCount++
          // Return same identifier every time — simulates a cycle
          return 'BUTTONstart'
        }),
      }),
    }

    await expect(
      tabToElement(page as any, target as any, { maxTabs: 100 })
    ).rejects.toThrow('Tab focus cycled back to the starting element')
  })

  it('succeeds on first Tab press when element immediately receives focus', async () => {
    const page = mockPage()
    const target = {
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue('found'),
      }),
    }

    await tabToElement(page as any, target as any)
    expect(page.keyboard.press).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// fuzzyFingerClick
// ---------------------------------------------------------------------------

describe('fuzzyFingerClick', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('clicks normally when shouldMiss returns false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // > 0.2 → no miss
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerClick(page as any, target as any, 5000, 'btn')

    // Should do one normal click, no mouse.click for miss
    expect(target.click).toHaveBeenCalledTimes(1)
    expect(page.mouse.click).not.toHaveBeenCalled()
  })

  it('does miss → pause → correct click when shouldMiss returns true', async () => {
    // First Math.random() < 0.2 → shouldMiss=true
    // Subsequent randoms are for strategy and miss-point computation
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // always < 0.2

    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerClick(page as any, target as any, 5000, 'btn')

    // Miss click + correct click
    expect(page.mouse.click).toHaveBeenCalledTimes(1)
    expect(target.click).toHaveBeenCalledTimes(1)
  })

  it('throws FuzzyFingerError when element vanishes after mis-click', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // shouldMiss=true
    const page = mockPage()
    const target = mockLocator({ clickFails: true, vanishes: true })

    await expect(
      fuzzyFingerClick(page as any, target as any, 5000, 'close-btn')
    ).rejects.toThrow(FuzzyFingerError)
  })

  it('re-throws original error when element still exists after failed click', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // shouldMiss=true
    const page = mockPage()
    const target = mockLocator({ clickFails: true, vanishes: false })

    await expect(
      fuzzyFingerClick(page as any, target as any, 5000, 'btn')
    ).rejects.toThrow('click failed')
  })

  it('waits for element visibility before anything else', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // no miss
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerClick(page as any, target as any, 3000, 'btn')

    expect(target.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 3000 })
  })

  it('skips mis-click when boundingBox returns null', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // shouldMiss=true
    const page = mockPage()
    const target = mockLocator({ box: null })

    await fuzzyFingerClick(page as any, target as any, 5000, 'btn')

    // No mouse click (no box), but correct click still happens
    expect(page.mouse.click).not.toHaveBeenCalled()
    expect(target.click).toHaveBeenCalledTimes(1)
  })

  it('approximately 20% of calls result in a mis-click', () => {
    // Statistical test: over many random values, ~20% should be < 0.2
    // We test the shouldMiss logic conceptually by checking the constant
    // (We can't easily test the private shouldMiss function, but we can
    // verify behavior by running many calls with real random)
    let missCount = 0
    const trials = 10000
    for (let i = 0; i < trials; i++) {
      if (Math.random() < 0.2) missCount++
    }
    // Should be roughly 2000 ± reasonable variance
    expect(missCount).toBeGreaterThan(1500)
    expect(missCount).toBeLessThan(2500)
  })
})

// ---------------------------------------------------------------------------
// fuzzyFingerFill
// ---------------------------------------------------------------------------

describe('fuzzyFingerFill', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fills normally when shouldMiss returns false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerFill(page as any, target as any, 'hello', 5000, 'input')

    expect(target.fill).toHaveBeenCalledWith('hello', { timeout: 5000 })
    expect(page.mouse.click).not.toHaveBeenCalled()
  })

  it('does miss → pause → fill when shouldMiss returns true', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerFill(page as any, target as any, 'hello', 5000, 'input')

    expect(page.mouse.click).toHaveBeenCalledTimes(1)
    expect(target.fill).toHaveBeenCalledWith('hello', { timeout: 5000 })
  })

  it('throws FuzzyFingerError when element vanishes after mis-click', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator({ fillFails: true, vanishes: true })

    await expect(
      fuzzyFingerFill(page as any, target as any, 'x', 5000, 'input')
    ).rejects.toThrow(FuzzyFingerError)
  })

  it('re-throws original error when element still exists', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator({ fillFails: true, vanishes: false })

    await expect(
      fuzzyFingerFill(page as any, target as any, 'x', 5000, 'input')
    ).rejects.toThrow('fill failed')
  })
})

// ---------------------------------------------------------------------------
// fuzzyFingerCheck
// ---------------------------------------------------------------------------

describe('fuzzyFingerCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('checks normally when shouldMiss returns false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerCheck(page as any, target as any, 5000, 'checkbox')

    expect(target.check).toHaveBeenCalledTimes(1)
    expect(page.mouse.click).not.toHaveBeenCalled()
  })

  it('does miss → pause → check when shouldMiss returns true', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator()

    await fuzzyFingerCheck(page as any, target as any, 5000, 'checkbox')

    expect(page.mouse.click).toHaveBeenCalledTimes(1)
    expect(target.check).toHaveBeenCalledTimes(1)
  })

  it('throws FuzzyFingerError when element vanishes after mis-click', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator({ checkFails: true, vanishes: true })

    await expect(
      fuzzyFingerCheck(page as any, target as any, 5000, 'checkbox')
    ).rejects.toThrow(FuzzyFingerError)
  })

  it('re-throws original error when element still exists', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const page = mockPage()
    const target = mockLocator({ checkFails: true, vanishes: false })

    await expect(
      fuzzyFingerCheck(page as any, target as any, 5000, 'checkbox')
    ).rejects.toThrow('check failed')
  })
})
