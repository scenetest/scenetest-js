import { useState, useEffect, useMemo } from 'preact/hooks'
import { createCollection } from '@tanstack/db'
import {
  createRunSource,
  runCollectionOptions,
  scenesProjection,
  assertionsProjection,
  actionsProjection,
  runsProjection,
} from './collections/index.js'
import { RunnerView } from './runner.js'
import type { Command } from '@scenetest/protocol'
import type { ConnectionStatus, DashboardTheme, Transport } from './types.js'
import type { DashboardCollections } from './select-helpers.js'

/** Routing props preact-iso passes if the dashboard is used as a route child. */
interface RoutableProps {
  path?: string
  default?: boolean
}

/** Build the inline `--st-*` custom properties for the theming surface. */
function themeVars(theme?: DashboardTheme): Record<string, string> {
  const vars: Record<string, string> = {}
  if (theme?.bg) vars['--st-bg'] = theme.bg
  if (theme?.accent) vars['--st-accent'] = theme.accent
  if (theme?.font) vars['--st-font'] = theme.font
  if (theme?.fontSize) vars['--st-font-size'] = theme.fontSize
  return vars
}

// ── The read model (one store, every view reads it via useLiveQuery) ──
// Created once per transport. The root does NOT subscribe to the row data — it
// only tracks connection liveness; each view subscribes to the tables it needs
// through `useLiveQuery`, so re-renders are scoped to the view that changed.
interface DashboardStore extends DashboardCollections {
  source: ReturnType<typeof createRunSource>
}

function useDashboardStore(transport: Transport): { store: DashboardStore; connection: ConnectionStatus } {
  const store = useMemo<DashboardStore>(() => {
    const source = createRunSource(transport)
    return {
      source,
      scenes: createCollection(runCollectionOptions({ source, projection: scenesProjection() })),
      assertions: createCollection(runCollectionOptions({ source, projection: assertionsProjection() })),
      actions: createCollection(runCollectionOptions({ source, projection: actionsProjection() })),
      runs: createCollection(runCollectionOptions({ source, projection: runsProjection() })),
    }
  }, [transport])

  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  useEffect(() => {
    const stopStatus = store.source.subscribe(() => {}, setConnection)
    return () => {
      stopStatus()
      store.source.close()
    }
  }, [store])

  return { store, connection }
}

/**
 * The Dashboard app — a single **Runner** view over one read-only `@tanstack/db`
 * read model. A plain Preact component rendering into the light DOM under a
 * single `.scenetest-dashboard` root class; the shipped stylesheet scopes
 * everything to it.
 *
 * **One view, mounted on the host's router.** There are no tabs anymore — the
 * Runner *is* the dashboard. The host still mounts it on `{base}/:view?` (dev via
 * `BrowserDashboard`, cloud on its own PR route), so both the base and any
 * trailing segment (`/runner`, an old deep-link) resolve to the same Runner
 * without a 404. Because a single component is rendered unconditionally, it stays
 * mounted and the store survives across any navigation.
 *
 * `apiBase` (default `basePath`) bases the Runner's server fetches (`/runs`,
 * `/source`, `/__open-in-editor`), decoupled because cloud's API lives elsewhere
 * than its router. `basePath` is the fallback for it. `path` / `default` are
 * accepted so the dashboard can also be a preact-iso route child directly.
 *
 * The collections are the single store: the component builds them from the run
 * stream and the Runner reads from them (`selectSnapshot`).
 */
export function Dashboard({
  transport,
  theme,
  basePath,
  apiBase,
}: {
  transport: Transport
  theme?: DashboardTheme
  /** The router mount the dashboard lives under; the host always supplies it. */
  basePath: string
  /**
   * Base path for the Runner's server-endpoint fetches (`/runs`, `/source`,
   * `/__open-in-editor`). Defaults to `basePath` — the symmetric self-hosted
   * case where the dashboard's URLs and its API share a mount. Cloud, whose API
   * lives elsewhere than its router, overrides it.
   */
  apiBase?: string
} & RoutableProps) {
  const { store, connection } = useDashboardStore(transport)

  const apiB = (apiBase ?? basePath).replace(/\/+$/, '')

  const send = (command: Command) => {
    void transport.sendCommand(command)
  }

  return (
    <div class="scenetest-dashboard" style={themeVars(theme)}>
      <RunnerView collections={store} connection={connection} base={apiB} send={send} />
    </div>
  )
}
