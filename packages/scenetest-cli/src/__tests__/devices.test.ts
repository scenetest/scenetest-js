import { describe, it, expect } from 'vitest'
import { DeviceRotation, builtinDevices } from '../devices.js'
import type { DeviceProfile } from '../devices.js'

describe('builtinDevices', () => {
  it('contains mobile, tablet, and desktop devices', () => {
    const categories = new Set(builtinDevices.map((d) => d.category))
    expect(categories).toContain('mobile')
    expect(categories).toContain('tablet')
    expect(categories).toContain('desktop')
  })

  it('has at least 2 devices per category', () => {
    const mobile = builtinDevices.filter((d) => d.category === 'mobile')
    const tablet = builtinDevices.filter((d) => d.category === 'tablet')
    const desktop = builtinDevices.filter((d) => d.category === 'desktop')

    expect(mobile.length).toBeGreaterThanOrEqual(2)
    expect(tablet.length).toBeGreaterThanOrEqual(2)
    expect(desktop.length).toBeGreaterThanOrEqual(2)
  })

  it('every device has valid contextOptions with viewport', () => {
    for (const device of builtinDevices) {
      expect(device.name).toBeTruthy()
      expect(device.contextOptions).toBeDefined()
      expect(device.contextOptions.viewport).toBeDefined()
      expect(device.contextOptions.viewport!.width).toBeGreaterThan(0)
      expect(device.contextOptions.viewport!.height).toBeGreaterThan(0)
    }
  })

  it('mobile devices have isMobile=true and hasTouch=true', () => {
    const mobiles = builtinDevices.filter((d) => d.category === 'mobile')
    for (const device of mobiles) {
      expect(device.contextOptions.isMobile).toBe(true)
      expect(device.contextOptions.hasTouch).toBe(true)
    }
  })

  it('desktop devices have isMobile=false', () => {
    const desktops = builtinDevices.filter((d) => d.category === 'desktop')
    for (const device of desktops) {
      expect(device.contextOptions.isMobile).toBe(false)
    }
  })
})

describe('DeviceRotation', () => {
  it('rotates through devices in order', () => {
    const pool: DeviceProfile[] = [
      { name: 'A', category: 'mobile', contextOptions: { viewport: { width: 100, height: 200 } } },
      { name: 'B', category: 'tablet', contextOptions: { viewport: { width: 300, height: 400 } } },
      { name: 'C', category: 'desktop', contextOptions: { viewport: { width: 500, height: 600 } } },
    ]

    const rotation = new DeviceRotation(pool)

    expect(rotation.next().name).toBe('A')
    expect(rotation.next().name).toBe('B')
    expect(rotation.next().name).toBe('C')
  })

  it('wraps around when pool is exhausted', () => {
    const pool: DeviceProfile[] = [
      { name: 'A', category: 'mobile', contextOptions: { viewport: { width: 100, height: 200 } } },
      { name: 'B', category: 'tablet', contextOptions: { viewport: { width: 300, height: 400 } } },
    ]

    const rotation = new DeviceRotation(pool)

    expect(rotation.next().name).toBe('A')
    expect(rotation.next().name).toBe('B')
    expect(rotation.next().name).toBe('A') // wraps
    expect(rotation.next().name).toBe('B')
  })

  it('uses builtin devices when no custom pool provided', () => {
    const rotation = new DeviceRotation()
    const first = rotation.next()
    expect(builtinDevices.some((d) => d.name === first.name)).toBe(true)
  })

  it('uses builtin devices when empty array provided', () => {
    const rotation = new DeviceRotation([])
    const first = rotation.next()
    expect(builtinDevices.some((d) => d.name === first.name)).toBe(true)
  })

  it('peek returns next without advancing', () => {
    const pool: DeviceProfile[] = [
      { name: 'A', category: 'mobile', contextOptions: { viewport: { width: 100, height: 200 } } },
      { name: 'B', category: 'tablet', contextOptions: { viewport: { width: 300, height: 400 } } },
    ]

    const rotation = new DeviceRotation(pool)

    expect(rotation.peek().name).toBe('A')
    expect(rotation.peek().name).toBe('A') // still A
    expect(rotation.next().name).toBe('A') // now advances
    expect(rotation.peek().name).toBe('B')
  })

  it('reset returns to the beginning', () => {
    const pool: DeviceProfile[] = [
      { name: 'A', category: 'mobile', contextOptions: { viewport: { width: 100, height: 200 } } },
      { name: 'B', category: 'tablet', contextOptions: { viewport: { width: 300, height: 400 } } },
    ]

    const rotation = new DeviceRotation(pool)
    rotation.next()
    rotation.next()
    expect(rotation.currentIndex).toBe(2)

    rotation.reset()
    expect(rotation.currentIndex).toBe(0)
    expect(rotation.next().name).toBe('A')
  })

  it('exposes the device pool as readonly', () => {
    const pool: DeviceProfile[] = [
      { name: 'A', category: 'mobile', contextOptions: { viewport: { width: 100, height: 200 } } },
    ]

    const rotation = new DeviceRotation(pool)
    expect(rotation.devices).toHaveLength(1)
    expect(rotation.devices[0].name).toBe('A')
  })

  it('different actors in the same run get different devices', () => {
    const rotation = new DeviceRotation()
    const assigned = new Set<string>()

    // Simulate 5 actors getting devices
    for (let i = 0; i < 5; i++) {
      assigned.add(rotation.next().name)
    }

    // With 10 builtin devices and 5 actors, all should be unique
    expect(assigned.size).toBe(5)
  })
})
