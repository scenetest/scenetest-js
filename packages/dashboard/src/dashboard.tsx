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
import { Waterfall } from './app.js'
import { selectWaterfall } from './select-waterfall.js'
import { RunnerView } from './runner.js'
import { useRunSlice } from './use-run-slice.js'
import type { Command } from '@scenetest/protocol'
import type { ConnectionStatus, DashboardTheme, Transport } from './types.js'
import type { DashboardCollections } from './select-helpers.js'

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

// ── Routing ───────────────────────────────────────────────────────
type Tab = 'home' | 'runner' | 'waterfall'

// Both hosts mount the dashboard (and its dev middleware endpoints) here. It's
// a single constant rather than a prop: the routing and the Runner's data
// fetches must agree, and nothing in-tree mounts it anywhere else.
const BASE = '/__scenetest'

function tabForPath(pathname: string): Tab {
  if (pathname.startsWith(`${BASE}/runner`)) return 'runner'
  if (pathname.startsWith(`${BASE}/waterfall`)) return 'waterfall'
  return 'home'
}

const PATH_FOR_TAB: Record<Tab, string> = {
  home: BASE,
  runner: `${BASE}/runner`,
  waterfall: `${BASE}/waterfall`,
}

/**
 * The Dashboard app — Home / Runner / Waterfall views over one read-only
 * `@tanstack/db` read model, routed on `location.pathname`. A plain Preact
 * component rendering into the light DOM under a single `.scenetest-dashboard`
 * root class; the shipped stylesheet scopes everything to it. Dev and cloud
 * render the same component — only the injected `transport` differs.
 *
 *   /__scenetest            → Home
 *   /__scenetest/runner     → Runner (filterable scene log)
 *   /__scenetest/waterfall  → Waterfall (live timeline)
 *
 * The collections are the single store: the component builds them from the run
 * stream and every view reads from them (`selectWaterfall`, `selectSnapshot`).
 */
export function Dashboard({
  transport,
  theme,
}: {
  transport: Transport
  theme?: DashboardTheme
}) {
  const { store, connection } = useDashboardStore(transport)
  const [tab, setTab] = useState<Tab>(() => tabForPath(location.pathname))

  useEffect(() => {
    const onPop = () => setTab(tabForPath(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Client-side navigation via real <a> links, delegated on the app root.
  // Modifier-clicks fall through to the browser as normal links.
  const onNavigate = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest('a')
    const href = a?.getAttribute('href')
    if (!href || !href.startsWith(BASE)) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    history.pushState(null, '', href + location.search)
    setTab(tabForPath(href))
  }

  const send = (command: Command) => {
    void transport.sendCommand(command)
  }

  const tabClass = (t: Tab) => 'tab' + (tab === t ? ' active' : '')

  return (
    <div class="scenetest-dashboard" style={themeVars(theme)} onClick={onNavigate}>
      <nav class="dashboard-nav">
        <h1>
          <span class="logo">🎬</span> Scenetest
        </h1>
        <div class="tabs">
          <a class={tabClass('home')} href={PATH_FOR_TAB.home}>
            Home
          </a>
          <a class={tabClass('runner')} href={PATH_FOR_TAB.runner}>
            Runner
          </a>
          <a class={tabClass('waterfall')} href={PATH_FOR_TAB.waterfall}>
            Waterfall
          </a>
        </div>
      </nav>
      <div class="view">
        {tab === 'home' ? (
          <Home />
        ) : tab === 'runner' ? (
          <RunnerView collections={store} connection={connection} base={BASE} />
        ) : (
          <WaterfallHost collections={store} connection={connection} send={send} />
        )}
      </div>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────
function Home() {
  return (
    <div class="index">
      <h1>
        <span class="logo">🎬</span> Scenetest
      </h1>
      <p class="lede">Pick a view.</p>
      <div class="cards">
        <a class="card" href={PATH_FOR_TAB.runner}>
          <div class="name">Scene runner →</div>
          <div class="desc">Live and past runs: scene tree, status, failure log, spec snippets.</div>
        </a>
        <a class="card" href={PATH_FOR_TAB.waterfall}>
          <div class="name">Waterfall →</div>
          <div class="desc">Live timeline of actors and inline check() / should() assertions.</div>
        </a>
      </div>
    </div>
  )
}

// ── Waterfall view ─────────────────────────────────────────────────
// A pure Preact subtree now — its widget styles are scoped to `.waterfall-host`
// by the stylesheet, so it no longer needs a nested shadow root. Reads the
// shared store reactively; `selectWaterfall` folds it into the Waterfall shape.
function WaterfallHost({
  collections,
  connection,
  send,
}: {
  collections: DashboardCollections
  connection: ConnectionStatus
  send: (c: Command) => void
}) {
  const slice = useRunSlice(collections)
  const view = useMemo(
    () => selectWaterfall(slice),
    [slice.runId, slice.run, slice.scenes, slice.assertions, slice.actions]
  )
  const state = { ...view, connection }

  return (
    <div class="waterfall-host">
      <Waterfall state={state} send={send} />
    </div>
  )
}
