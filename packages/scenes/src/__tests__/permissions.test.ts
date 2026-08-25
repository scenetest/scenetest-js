import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_GRANTED,
  SUPPORTED_PERMISSIONS,
  resolvePermissions,
  resolveContextOptions,
} from '../permissions.js'

const silent = () => {}

describe('SUPPORTED_PERMISSIONS', () => {
  // Mirrors Playwright's per-browser permission maps. Playwright throws
  // "Unknown permission" at newContext() for anything outside them.
  it('carries the clipboard permissions each browser accepts', () => {
    expect(SUPPORTED_PERMISSIONS.chromium).toContain('clipboard-read')
    expect(SUPPORTED_PERMISSIONS.chromium).toContain('clipboard-write')
    expect(SUPPORTED_PERMISSIONS.webkit).toContain('clipboard-read')
    expect(SUPPORTED_PERMISSIONS.webkit).not.toContain('clipboard-write')
    expect(SUPPORTED_PERMISSIONS.firefox).not.toContain('clipboard-read')
    expect(SUPPORTED_PERMISSIONS.firefox).not.toContain('clipboard-write')
  })

  it('grants the clipboard by default', () => {
    expect(DEFAULT_GRANTED).toEqual(['clipboard-read', 'clipboard-write'])
  })
})

describe('resolvePermissions', () => {
  it('grants the defaults the browser supports', () => {
    expect(resolvePermissions(undefined, 'chromium', silent)).toEqual(['clipboard-read', 'clipboard-write'])
    expect(resolvePermissions(undefined, 'webkit', silent)).toEqual(['clipboard-read'])
    expect(resolvePermissions(undefined, 'firefox', silent)).toEqual([])
  })

  it('adds a permission without revoking the defaults', () => {
    expect(resolvePermissions({ geolocation: true }, 'chromium', silent)).toEqual([
      'clipboard-read',
      'clipboard-write',
      'geolocation',
    ])
  })

  it('drops just the permission set to false', () => {
    expect(resolvePermissions({ 'clipboard-read': false }, 'chromium', silent)).toEqual(['clipboard-write'])
  })

  it('combines an add and a drop', () => {
    expect(
      resolvePermissions({ 'clipboard-write': false, geolocation: true }, 'chromium', silent)
    ).toEqual(['clipboard-read', 'geolocation'])
  })

  it('opts out of everything when both defaults are false', () => {
    expect(
      resolvePermissions({ 'clipboard-read': false, 'clipboard-write': false }, 'chromium', silent)
    ).toEqual([])
  })

  it('skips a requested permission the browser does not support, and warns', () => {
    const warn = vi.fn()
    expect(resolvePermissions({ camera: true }, 'firefox', warn)).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('camera')
    expect(warn.mock.calls[0][0]).toContain('firefox')
  })

  it('stays quiet about a default the browser does not support', () => {
    const warn = vi.fn()
    resolvePermissions(undefined, 'firefox', warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays quiet about an unsupported permission that was turned off anyway', () => {
    const warn = vi.fn()
    expect(resolvePermissions({ camera: false }, 'firefox', warn)).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps a supported permission alongside a skipped one', () => {
    const warn = vi.fn()
    expect(resolvePermissions({ geolocation: true, camera: true }, 'firefox', warn)).toEqual(['geolocation'])
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('resolveContextOptions', () => {
  it('applies the default permissions when nothing is configured', () => {
    expect(resolveContextOptions(undefined, undefined, 'chromium', silent)).toEqual({
      permissions: ['clipboard-read', 'clipboard-write'],
    })
  })

  it('returns null when there is nothing to apply', () => {
    expect(resolveContextOptions(undefined, undefined, 'firefox', silent)).toBeNull()
  })

  it('keeps passthrough options alongside resolved permissions', () => {
    expect(resolveContextOptions({ locale: 'fr-FR' }, { geolocation: true }, 'chromium', silent)).toEqual({
      locale: 'fr-FR',
      permissions: ['clipboard-read', 'clipboard-write', 'geolocation'],
    })
  })

  it('lets a raw contextOptions.permissions array win outright', () => {
    expect(
      resolveContextOptions({ permissions: ['geolocation'] }, { geolocation: true }, 'chromium', silent)
    ).toEqual({ permissions: ['geolocation'] })
  })

  it('does not mutate the configured options', () => {
    const contextOptions = { locale: 'fr-FR' }
    const overrides = { geolocation: true }
    resolveContextOptions(contextOptions, overrides, 'chromium', silent)
    expect(contextOptions).toEqual({ locale: 'fr-FR' })
    expect(overrides).toEqual({ geolocation: true })
  })
})
