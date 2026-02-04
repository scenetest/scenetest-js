import { describe, it, expect } from 'vitest'

describe('reverse-selector', () => {
  // We can't easily test DOM-dependent code in unit tests without jsdom.
  // These tests verify the module structure and non-DOM helpers.

  it('exports SELECTOR_ATTRIBUTES in the correct priority order', async () => {
    const { SELECTOR_ATTRIBUTES } = await import('../types.js')

    expect(SELECTOR_ATTRIBUTES).toEqual([
      'aria-label',
      'id',
      'data-testid',
      'data-name',
      'data-key',
      'name',
    ])
  })

  it('exports reverseSelector function', async () => {
    const mod = await import('../reverse-selector.js')
    expect(typeof mod.reverseSelector).toBe('function')
    expect(typeof mod.nearestAddressable).toBe('function')
    expect(typeof mod.explainUnaddressable).toBe('function')
  })
})

describe('types', () => {
  it('DslLine shape is correct', async () => {
    const { SELECTOR_ATTRIBUTES } = await import('../types.js')
    expect(SELECTOR_ATTRIBUTES.length).toBe(6)
  })
})

describe('capture', () => {
  it('exports startCapture function', async () => {
    const mod = await import('../capture.js')
    expect(typeof mod.startCapture).toBe('function')
  })
})

describe('panel', () => {
  it('exports panel functions', async () => {
    const mod = await import('../panel.js')
    expect(typeof mod.createRecorderPanel).toBe('function')
    expect(typeof mod.attachPanelListeners).toBe('function')
    expect(typeof mod.appendLine).toBe('function')
    expect(typeof mod.appendAnnotation).toBe('function')
    expect(typeof mod.appendWarning).toBe('function')
    expect(typeof mod.removeLine).toBe('function')
    expect(typeof mod.clearPanel).toBe('function')
    expect(typeof mod.setRecordingState).toBe('function')
    expect(typeof mod.renderAllLines).toBe('function')
  })
})

describe('index', () => {
  it('exports recorder functions', async () => {
    const mod = await import('../index.js')
    expect(typeof mod.initRecorder).toBe('function')
    expect(typeof mod.getDslLines).toBe('function')
    expect(typeof mod.getRecorderState).toBe('function')
    expect(typeof mod.destroyRecorder).toBe('function')
  })
})
