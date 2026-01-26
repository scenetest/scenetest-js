import { devices as playwrightDevices } from 'playwright'
import type { BrowserContextOptions } from 'playwright'

/**
 * A device profile used for actor browser context emulation.
 * Wraps Playwright's device descriptors with metadata.
 */
export interface DeviceProfile {
  /** Human-readable name */
  name: string
  /** Category for reporting */
  category: 'mobile' | 'tablet' | 'desktop'
  /** Playwright context options (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) */
  contextOptions: BrowserContextOptions
}

/**
 * Built-in device profiles covering a range of form factors.
 * Uses Playwright's device descriptors where available,
 * with custom desktop profiles added.
 */
export const builtinDevices: DeviceProfile[] = [
  // Mobile phones
  {
    name: 'iPhone 14',
    category: 'mobile',
    contextOptions: playwrightDevices['iPhone 14'] ?? {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    },
  },
  {
    name: 'iPhone 12',
    category: 'mobile',
    contextOptions: playwrightDevices['iPhone 12'] ?? {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    },
  },
  {
    name: 'Pixel 7',
    category: 'mobile',
    contextOptions: playwrightDevices['Pixel 7'] ?? {
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    },
  },
  {
    name: 'Galaxy S9+',
    category: 'mobile',
    contextOptions: playwrightDevices['Galaxy S9+'] ?? {
      viewport: { width: 320, height: 658 },
      deviceScaleFactor: 4.5,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    },
  },
  // Tablets
  {
    name: 'iPad Pro 11',
    category: 'tablet',
    contextOptions: playwrightDevices['iPad Pro 11'] ?? {
      viewport: { width: 834, height: 1194 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    },
  },
  {
    name: 'iPad Mini',
    category: 'tablet',
    contextOptions: playwrightDevices['iPad Mini'] ?? {
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    },
  },
  // Desktops
  {
    name: 'Desktop 1920x1080',
    category: 'desktop',
    contextOptions: {
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: 'Desktop 1366x768',
    category: 'desktop',
    contextOptions: {
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: 'Desktop 1440x900',
    category: 'desktop',
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: 'Desktop 2560x1440',
    category: 'desktop',
    contextOptions: {
      viewport: { width: 2560, height: 1440 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
]

/**
 * Manages device assignment via round-robin rotation.
 *
 * Each actor gets the next device in the pool. The rotation advances
 * globally across all actors and scenes within a run, so no one "picks"
 * their device — it just rotates around.
 *
 * The pool can be the built-in set or a custom set from config.
 */
export class DeviceRotation {
  private pool: DeviceProfile[]
  private index = 0

  constructor(devices?: DeviceProfile[]) {
    this.pool = devices && devices.length > 0 ? devices : builtinDevices
  }

  /**
   * Get the next device in rotation.
   * Advances the internal counter so successive calls yield different devices.
   */
  next(): DeviceProfile {
    const device = this.pool[this.index % this.pool.length]
    this.index++
    return device
  }

  /**
   * Peek at the next device without advancing the counter.
   */
  peek(): DeviceProfile {
    return this.pool[this.index % this.pool.length]
  }

  /**
   * Reset rotation to the beginning.
   */
  reset(): void {
    this.index = 0
  }

  /**
   * Get the current rotation index (for reporting).
   */
  get currentIndex(): number {
    return this.index
  }

  /**
   * Get the full device pool.
   */
  get devices(): readonly DeviceProfile[] {
    return this.pool
  }
}
