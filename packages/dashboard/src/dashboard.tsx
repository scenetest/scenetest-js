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
import { selectWaterfall } from './store.js'
import { RunnerView } from './runner.js'
import { STYLES } from './styles.js'
import { DASHBOARD_STYLES } from './dashboard-styles.js'
import type { Command } from '@scenetest/protocol'
import type { ConnectionStatus, DashboardHandle, DashboardTheme, MountOptions, Transport } from './types.js'
import type { DashboardRows } from './select-helpers.js'

/**
 * Mount the **Dashboard** — the whole app: Home / Runner / Waterfall views over
 * one read-only `@tanstack/db` read model, routed on `location.pathname`. Dev
 * and cloud mount the same app; only the injected `transport` differs.
 *
 *   /__scenetest            → Home
 *   /__scenetest/runner     → Runner (filterable scene log)
 *   /__scenetest/dashboard  → Waterfall (live timeline)
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

// ── The read model (one store, read by every view) ────────────────
function useDashboardRows(transport: Transport): DashboardRows {
  const store = useMemo(() => {
    const source = createRunSource(transport)
    return {
      source,
      scenes: createCollection(runCollectionOptions({ source, projection: scenesProjection() })),
      assertions: createCollection(runCollectionOptions({ source, projection: assertionsProjection() })),
      actions: createCollection(runCollectionOptions({ source, projection: actionsProjection() })),
      runs: createCollection(runCollectionOptions({ source, projection: runsProjection() })),
    }
  }, [transport])

  const [, setTick] = useState(0)
  const bump = () => setTick((t) => t + 1)
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const subs = [store.scenes, store.assertions, store.actions, store.runs].map((c) =>
      c.subscribeChanges(() => bump())
    )
    // A status-only subscription on the shared source (the collections drive
    // the data; this just surfaces connection liveness for the header).
    const stopStatus = store.source.subscribe(() => {}, setConnection)
    return () => {
      for (const s of subs) s.unsubscribe()
      stopStatus()
      store.source.close()
    }
  }, [store])

  return {
    scenes: store.scenes.toArray,
    assertions: store.assertions.toArray,
    actions: store.actions.toArray,
    runs: store.runs.toArray,
    connection,
  }
}

// ── Routing ───────────────────────────────────────────────────────
type Tab = 'home' | 'runner' | 'waterfall'

function tabForPath(pathname: string): Tab {
  if (pathname.startsWith('/__scenetest/runner')) return 'runner'
  if (pathname.startsWith('/__scenetest/dashboard')) return 'waterfall'
  return 'home'
}

const PATH_FOR_TAB: Record<Tab, string> = {
  home: '/__scenetest',
  runner: '/__scenetest/runner',
  waterfall: '/__scenetest/dashboard',
}

// ── Dashboard root ────────────────────────────────────────────────
function Dashboard({ transport, theme, base }: { transport: Transport; theme?: DashboardTheme; base: string }) {
  const rows = useDashboardRows(transport)
  const [tab, setTab] = useState<Tab>(() => tabForPath(location.pathname))

  useEffect(() => {
    const onPop = () => setTab(tabForPath(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (next: Tab) => {
    if (next !== tab) {
      history.pushState(null, '', PATH_FOR_TAB[next] + location.search)
      setTab(next)
    }
  }

  const send = (command: Command) => {
    void transport.sendCommand(command)
  }

  return (
    <div class="dashboard">
      <nav class="dashboard-nav">
        <h1>
          <span class="logo">🎬</span> Scenetest
        </h1>
        <div class="tabs">
          <button class={'tab' + (tab === 'home' ? ' active' : '')} onClick={() => go('home')}>
            Home
          </button>
          <button class={'tab' + (tab === 'runner' ? ' active' : '')} onClick={() => go('runner')}>
            Runner
          </button>
          <button class={'tab' + (tab === 'waterfall' ? ' active' : '')} onClick={() => go('waterfall')}>
            Waterfall
          </button>
        </div>
      </nav>
      <div class="view">
        {tab === 'home' ? (
          <Home onGo={go} />
        ) : tab === 'runner' ? (
          <RunnerView rows={rows} base={base} />
        ) : (
          <WaterfallHost rows={rows} send={send} theme={theme} />
        )}
      </div>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────
function Home({ onGo }: { onGo: (t: Tab) => void }) {
  return (
    <div class="index">
      <h1>
        <span class="logo">🎬</span> Scenetest
      </h1>
      <p class="lede">Pick a view.</p>
      <div class="cards">
        <button class="card" onClick={() => onGo('runner')}>
          <div class="name">Scene runner →</div>
          <div class="desc">Live and past runs: scene tree, status, failure log, spec snippets.</div>
        </button>
        <button class="card" onClick={() => onGo('waterfall')}>
          <div class="name">Waterfall →</div>
          <div class="desc">Live timeline of actors and inline check() / should() assertions.</div>
        </button>
      </div>
    </div>
  )
}

// ── Waterfall view (nested shadow root for style isolation) ────────
// The widget keeps its own stylesheet (`styles.ts`) in a nested shadow root so
// its bare element selectors don't bleed into the dashboard chrome — but its
// data is the shared store, computed by `selectWaterfall` and re-rendered into
// the nested tree on every change.
function WaterfallHost({ rows, send, theme }: { rows: DashboardRows; send: (c: Command) => void; theme?: DashboardTheme }) {
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

  const state = { ...selectWaterfall(rows.scenes, rows.assertions, rows.actions, rows.runs), connection: rows.connection }
  useEffect(() => {
    if (containerRef.current) render(<Waterfall state={state} send={send} />, containerRef.current)
  })

  return <div class="waterfall-host" ref={hostRef}></div>
}
