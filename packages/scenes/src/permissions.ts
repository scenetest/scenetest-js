import type { BrowserContextOptions } from 'playwright'

/** The browsers the CLI can launch. */
export type BrowserName = 'chromium' | 'firefox' | 'webkit'

/**
 * Which permissions to grant, by name.
 *
 * A record rather than a list, because some permissions are granted by default
 * and some are not. A list would mean restating the defaults to add one thing —
 * `['geolocation']` would silently revoke the clipboard. Each entry is a delta
 * against {@link DEFAULT_GRANTED}.
 */
export type PermissionOverrides = Record<string, boolean>

/**
 * Permissions granted to every actor unless turned off.
 *
 * A "copy link" button is ordinary UI, but the permission behind it has nobody
 * to grant it in a test run: `navigator.clipboard.writeText()` rejects with
 * `NotAllowedError`, the app catches it and shows an error, and the scene fails
 * on something that works for a real user.
 */
export const DEFAULT_GRANTED: readonly string[] = ['clipboard-read', 'clipboard-write']

/**
 * The permission names each browser's Playwright binding accepts.
 *
 * Playwright keeps a separate map per browser and throws `Unknown permission`
 * at `browser.newContext()` for a name its map doesn't carry, so a permission
 * has to be checked against the browser actually being launched.
 */
export const SUPPORTED_PERMISSIONS: Record<BrowserName, readonly string[]> = {
  chromium: [
    'geolocation', 'midi', 'notifications', 'camera', 'microphone',
    'background-sync', 'ambient-light-sensor', 'accelerometer', 'gyroscope',
    'magnetometer', 'clipboard-read', 'clipboard-write', 'payment-handler',
    'midi-sysex', 'storage-access', 'local-fonts', 'local-network-access',
  ],
  firefox: ['geolocation', 'persistent-storage', 'push', 'notifications'],
  webkit: ['geolocation', 'notifications', 'clipboard-read'],
}

/**
 * Resolve the permission list handed to `browser.newContext()`.
 *
 * Starts from {@link DEFAULT_GRANTED} and applies `overrides` on top, so a
 * config only ever states its deltas: `{ geolocation: true }` adds geolocation
 * and keeps the clipboard, `{ 'clipboard-read': false }` drops just that one.
 *
 * A name the browser doesn't support is dropped rather than thrown on, since
 * Playwright would otherwise fail the whole run at context creation. Dropping
 * one the config asked for is reported through `warn`; dropping a default
 * (`clipboard-write` on webkit, both on firefox) is expected and stays quiet.
 */
export function resolvePermissions(
  overrides: PermissionOverrides | undefined,
  browser: BrowserName,
  warn: (message: string) => void = console.warn
): string[] {
  const supported = SUPPORTED_PERMISSIONS[browser]

  // Map keeps a stable order: defaults first, then whatever the config adds.
  const wanted = new Map<string, boolean>(DEFAULT_GRANTED.map((name) => [name, true]))
  const requested = new Set<string>()
  for (const [name, grant] of Object.entries(overrides ?? {})) {
    wanted.set(name, grant)
    if (grant) requested.add(name)
  }

  const granted: string[] = []
  const dropped: string[] = []
  for (const [name, grant] of wanted) {
    if (!grant) continue
    if (supported.includes(name)) {
      granted.push(name)
    } else if (requested.has(name)) {
      dropped.push(name)
    }
  }

  if (dropped.length > 0) {
    warn(
      `[scenetest] ${browser} has no ${dropped.join(', ')} permission — ` +
      `not granted. Supported: ${supported.join(', ')}.`
    )
  }

  return granted
}

/**
 * Build the browser-context options applied to every actor context.
 *
 * `contextOptions` is a straight passthrough to Playwright. Its own
 * `permissions` key, if set, is taken as written and wins over `permissions` —
 * the escape hatch for handing Playwright an exact list.
 *
 * Returns null when there is nothing to apply.
 */
export function resolveContextOptions(
  contextOptions: BrowserContextOptions | undefined,
  overrides: PermissionOverrides | undefined,
  browser: BrowserName,
  warn: (message: string) => void = console.warn
): BrowserContextOptions | null {
  const permissions = contextOptions?.permissions ?? resolvePermissions(overrides, browser, warn)
  const resolved: BrowserContextOptions = {
    ...contextOptions,
    ...(permissions.length > 0 ? { permissions } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : null
}
