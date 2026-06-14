import { h, render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import htm from 'htm'
import { mountDashboard } from './mount.js'
import { RunnerView } from './runner.js'
import { CONSOLE_STYLES } from './console-styles.js'
import type { DashboardHandle, DashboardTheme, MountOptions, Transport } from './types.js'

const html = htm.bind(h)

/**
 * Mount the unified console into `element`: one app with Home / Runner /
 * Waterfall views over the shared read model, the dev + cloud target of
 * `docs/public/design/unified-console.md`. It owns a shadow root (its own
 * namespaced styles) and routes on `location.pathname`:
 *
 *   /__scenetest            → Home
 *   /__scenetest/runner     → Runner (filterable scene log, projections fold)
 *   /__scenetest/dashboard  → Waterfall (the `mountDashboard` widget, nested)
 *
 * The Waterfall is the existing widget demoted from a page to a view — it's
 * mounted via `mountDashboard` into a nested shadow root, so its styles stay
 * isolated from the console chrome. Dev and cloud mount the same console; only
 * the injected `transport` differs.
 */
export interface ConsoleOptions extends MountOptions {
  /** Base path the middleware is mounted at. Defaults to `/__scenetest`. */
  base?: string
}

export function mountConsole(element: HTMLElement, options: ConsoleOptions): DashboardHandle {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = CONSOLE_STYLES
  root.appendChild(style)

  if (options.theme) applyTheme(root, options.theme)

  const container = document.createElement('div')
  root.appendChild(container)

  const base = (options.base ?? '/__scenetest').replace(/\/+$/, '')
  render(h(Console, { transport: options.transport, theme: options.theme, base }), container)

  return {
    unmount() {
      render(null, container)
      root.innerHTML = ''
    },
  }
}

function applyTheme(root: ShadowRoot, theme: DashboardTheme): void {
  const host = root.host as HTMLElement
  if (theme.bg) host.style.setProperty('--st-bg', theme.bg)
  if (theme.accent) host.style.setProperty('--st-accent', theme.accent)
  if (theme.font) host.style.setProperty('--st-font', theme.font)
  if (theme.fontSize) host.style.setProperty('--st-font-size', theme.fontSize)
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

// ── Console root ──────────────────────────────────────────────────
function Console({ transport, theme, base }: { transport: Transport; theme?: DashboardTheme; base: string }) {
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

  return html`
    <div class="console">
      <nav class="console-nav">
        <h1><span class="logo">🎬</span> Scenetest</h1>
        <div class="tabs">
          <button class=${'tab' + (tab === 'home' ? ' active' : '')} onClick=${() => go('home')}>Home</button>
          <button class=${'tab' + (tab === 'runner' ? ' active' : '')} onClick=${() => go('runner')}>Runner</button>
          <button class=${'tab' + (tab === 'waterfall' ? ' active' : '')} onClick=${() => go('waterfall')}>Waterfall</button>
        </div>
      </nav>
      <div class="view">
        ${tab === 'home'
          ? html`<${Home} onGo=${go} />`
          : tab === 'runner'
            ? html`<${RunnerView} transport=${transport} base=${base} />`
            : html`<${Waterfall} transport=${transport} theme=${theme} />`}
      </div>
    </div>
  `
}

// ── Home ──────────────────────────────────────────────────────────
function Home({ onGo }: { onGo: (t: Tab) => void }) {
  return html`
    <div class="index">
      <h1><span class="logo">🎬</span> Scenetest</h1>
      <p class="lede">Pick a view.</p>
      <div class="cards">
        <button class="card" onClick=${() => onGo('runner')}>
          <div class="name">Scene runner →</div>
          <div class="desc">Live and past runs: scene tree, status, failure log, spec snippets.</div>
        </button>
        <button class="card" onClick=${() => onGo('waterfall')}>
          <div class="name">Waterfall →</div>
          <div class="desc">Live timeline of actors and inline check() / should() assertions.</div>
        </button>
      </div>
    </div>
  `
}

// ── Waterfall (the existing widget, mounted into a nested shadow root) ──
function Waterfall({ transport, theme }: { transport: Transport; theme?: DashboardTheme }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const handle = mountDashboard(ref.current, { transport, ...(theme ? { theme } : {}) })
    return () => handle.unmount()
  }, [transport, theme])
  return html`<div class="waterfall-host" ref=${ref}></div>`
}
