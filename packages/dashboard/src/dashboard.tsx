import { useState, useEffect, useMemo } from 'preact/hooks'
import { useRoute } from 'preact-iso'
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
 * The Dashboard app — Home + Runner over one read-only `@tanstack/db` read
 * model. A plain Preact component rendering into the light
 * DOM under a single `.scenetest-dashboard` root class; the shipped stylesheet
 * scopes everything to it.
 *
 * **Routing rides on `preact-iso`.** The host mounts the dashboard on a single
 * route with an *optional* trailing param — `{base}/:view?` — which matches the
 * base **and** each view in one pattern (`:view?` is how a scoped router handles
 * its own exact base). preact-iso hands back the matched segment as a param;
 * the dashboard reads `useRoute().params.view` and renders it. The surrounding
 * `LocationProvider` (the host's, or the one `BrowserDashboard` supplies) owns
 * the URL and intercepts the tab `<a>` clicks. Because the match is a route
 * param, the *same* component works whether it's the whole app (dev) or mounted
 * on a per-PR route of a bigger preact-iso app (scenetest-cloud, at
 * `/repo/:owner/:name/pr/:number/:view?`) — one router, owned by the host.
 *
 * `basePath` is only used to build the absolute, deep-linkable tab hrefs;
 * `apiBase` (default `basePath`) bases the Runner's server fetches, decoupled
 * because cloud's API lives elsewhere than its router. `path` / `default` are
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
  /** The mount the tab anchors point under — the host always supplies it. */
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
  const { params } = useRoute()

  const base = basePath.replace(/\/+$/, '')
  const apiB = (apiBase ?? basePath).replace(/\/+$/, '')
  // The matched `:view?` segment; absent at the base → Home.
  const view = params.view === 'runner' ? 'runner' : 'home'
  const tabClass = (t: string) => 'tab' + (view === t ? ' active' : '')

  const send = (command: Command) => {
    void transport.sendCommand(command)
  }

  return (
    <div class="scenetest-dashboard" style={themeVars(theme)}>
      <nav class="dashboard-nav">
        <h1>
          <span class="logo">🎬</span> Scenetest
        </h1>
        <div class="tabs">
          <a class={tabClass('home')} href={base || '/'}>
            Home
          </a>
          <a class={tabClass('runner')} href={`${base}/runner`}>
            Runner
          </a>
        </div>
      </nav>
      <div class="view">
        {view === 'runner' ? (
          <RunnerView collections={store} connection={connection} base={apiB} send={send} />
        ) : (
          <Home basePath={base} />
        )}
      </div>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────
function Home({ basePath }: { basePath: string }) {
  return (
    <div class="index">
      <h1>
        <span class="logo">🎬</span> Scenetest
      </h1>
      <p class="lede">Live and past runs, in one view.</p>
      <div class="cards">
        <a class="card" href={`${basePath}/runner`}>
          <div class="name">Scene runner →</div>
          <div class="desc">
            Scenes and files, status, failure log, actor timeline, spec snippets — plus run controls (replay, pause,
            stop).
          </div>
        </a>
      </div>
    </div>
  )
}
