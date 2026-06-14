import { render } from 'preact'
import { useState, useEffect, useMemo, useRef } from 'preact/hooks'
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
import { useLiveQuery } from './use-live-query.js'
import { STYLES } from './styles.js'
import { DASHBOARD_STYLES } from './dashboard-styles.js'
import type { Command } from '@scenetest/protocol'
import type { ConnectionStatus, DashboardHandle, DashboardTheme, MountOptions, Transport } from './types.js'
import type { DashboardCollections } from './select-helpers.js'

/**
 * Mount the **Dashboard** — the whole app: Home / Runner / Waterfall views over
 * one read-only `@tanstack/db` read model, routed on `location.pathname`. Dev
 * and cloud mount the same app; only the injected `transport` differs.
 *
 *   /__scenetest            → Home
 *   /__scenetest/runner     → Runner (filterable scene log)
 *   /__scenetest/waterfall  → Waterfall (live timeline)
 *
 * The collections are the single store: the root builds them from the run
 * stream and every view reads from them (`selectWaterfall`, `selectSnapshot`).
 * The Waterfall renders into a nested shadow root so its widget styles stay
 * isolated from the dashboard chrome — but its data comes from the same store.
 */
export function mountDashboard(element: HTMLElement, options: MountOptions): DashboardHandle {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = DASHBOARD_STYLES
  root.appendChild(style)

  if (options.theme) applyTheme(root.host as HTMLElement, options.theme)

  const container = document.createElement('div')
  root.appendChild(container)

  const base = (options.base ?? '/__scenetest').replace(/\/+$/, '')
  render(<Dashboard transport={options.transport} theme={options.theme} base={base} />, container)

  return {
    unmount() {
      render(null, container)
      root.innerHTML = ''
    },
  }
}

function applyTheme(el: HTMLElement, theme: DashboardTheme): void {
  if (theme.bg) el.style.setProperty('--st-bg', theme.bg)
  if (theme.accent) el.style.setProperty('--st-accent', theme.accent)
  if (theme.font) el.style.setProperty('--st-font', theme.font)
  if (theme.fontSize) el.style.setProperty('--st-font-size', theme.fontSize)
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

function tabForPath(pathname: string): Tab {
  if (pathname.startsWith('/__scenetest/runner')) return 'runner'
  if (pathname.startsWith('/__scenetest/waterfall')) return 'waterfall'
  return 'home'
}

const PATH_FOR_TAB: Record<Tab, string> = {
  home: '/__scenetest',
  runner: '/__scenetest/runner',
  waterfall: '/__scenetest/waterfall',
}

// ── Dashboard root ────────────────────────────────────────────────
function Dashboard({ transport, theme, base }: { transport: Transport; theme?: DashboardTheme; base: string }) {
  const { store, connection } = useDashboardStore(transport)
  const [tab, setTab] = useState<Tab>(() => tabForPath(location.pathname))

  useEffect(() => {
    const onPop = () => setTab(tabForPath(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Client-side navigation via real <a> links. We delegate the click on the app
  // root — which is *inside* the shadow root, so there's no event retargeting
  // (a document-level listener, as preact-iso uses, would see the shadow host,
  // not the <a>). Modifier-clicks fall through to the browser as normal links.
  const onNavigate = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest('a')
    const href = a?.getAttribute('href')
    if (!href || !href.startsWith('/__scenetest')) return
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
    <div class="dashboard" onClick={onNavigate}>
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
          <RunnerView collections={store} connection={connection} base={base} />
        ) : (
          <WaterfallHost collections={store} connection={connection} send={send} theme={theme} />
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

// ── Waterfall view (nested shadow root for style isolation) ────────
// The widget keeps its own stylesheet (`styles.ts`) in a nested shadow root so
// its bare element selectors don't bleed into the dashboard chrome — but its
// data is the shared store, computed by `selectWaterfall` and re-rendered into
// the nested tree on every change.
function WaterfallHost({
  collections,
  connection,
  send,
  theme,
}: {
  collections: DashboardCollections
  connection: ConnectionStatus
  send: (c: Command) => void
  theme?: DashboardTheme
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const sr = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    sr.innerHTML = ''
    const style = document.createElement('style')
    style.textContent = STYLES
    sr.appendChild(style)
    if (theme) applyTheme(host, theme)
    const container = document.createElement('div')
    sr.appendChild(container)
    containerRef.current = container
    return () => {
      render(null, container)
      sr.innerHTML = ''
      containerRef.current = null
    }
  }, [theme])

  // Read the store reactively; the selector folds it into the Waterfall shape.
  const scenes = useLiveQuery(collections.scenes)
  const assertions = useLiveQuery(collections.assertions)
  const actions = useLiveQuery(collections.actions)
  const runs = useLiveQuery(collections.runs)
  const state = { ...selectWaterfall(scenes, assertions, actions, runs), connection }
  useEffect(() => {
    if (containerRef.current) render(<Waterfall state={state} send={send} />, containerRef.current)
  })

  return <div class="waterfall-host" ref={hostRef}></div>
}
