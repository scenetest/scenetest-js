// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'preact'
import { LocationProvider, Router } from 'preact-iso'
import { BrowserDashboard } from '../browser-dashboard.js'
import { Dashboard } from '../dashboard.js'
import type { Transport } from '../types.js'

// A transport that connects to nothing — we're testing routing, not data.
const stubTransport: Transport = {
  subscribe: () => () => {},
  sendCommand: async () => {},
}

// The Runner view fires `fetch('/runs')`; keep it from throwing in jsdom.
beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in test')))
})

function mountAt(path: string): HTMLElement {
  history.replaceState(null, '', path)
  const root = document.createElement('div')
  document.body.appendChild(root)
  render(<BrowserDashboard transport={stubTransport} />, root)
  return root
}

describe('Dashboard routing: single preact-iso `{base}/:view?` route', () => {
  it('deep-link to the base shows Home', () => {
    const root = mountAt('/__scenetest')
    expect(root.querySelector('.index')).not.toBeNull() // Home
    expect(root.textContent).toContain('Pick a view')
  })

  it('deep-link to {base}/runner shows the Runner (not Home)', () => {
    const root = mountAt('/__scenetest/runner')
    expect(root.querySelector('.runner')).not.toBeNull()
    expect(root.querySelector('#run-select')).not.toBeNull() // Runner's run picker
    expect(root.querySelector('.index')).toBeNull()
  })

  it('deep-link to {base}/waterfall shows the Waterfall (not Home)', () => {
    const root = mountAt('/__scenetest/waterfall')
    expect(root.querySelector('.waterfall-host')).not.toBeNull()
    expect(root.querySelector('.index')).toBeNull()
  })

  it('clicking a tab navigates client-side: view + URL change, no reload', async () => {
    const root = mountAt('/__scenetest')
    expect(root.querySelector('.index')).not.toBeNull() // Home

    const runnerTab = Array.from(root.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Runner')!
    runnerTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await Promise.resolve()

    expect(location.pathname).toBe('/__scenetest/runner') // URL changed
    expect(root.querySelector('.runner')).not.toBeNull() // view changed
    expect(root.querySelector('.index')).toBeNull() // not a full reload to Home
  })

  it('survives view changes without tearing down the store/SSE (stable mount)', async () => {
    // Count stream opens/closes: createRunSource calls transport.subscribe once
    // and its returned unsubscribe on close. If <Dashboard> remounted on a tab
    // change, we'd see a second open (and a close) — the read model + SSE
    // rebuilt from scratch on every click. The single `:view?` route keeps it
    // mounted, so this stays 1 / 0.
    let opened = 0
    let closed = 0
    const transport: Transport = {
      subscribe: () => {
        opened++
        return () => {
          closed++
        }
      },
      sendCommand: async () => {},
    }
    history.replaceState(null, '', '/__scenetest')
    const root = document.createElement('div')
    document.body.appendChild(root)
    render(<BrowserDashboard transport={transport} />, root)
    expect(opened).toBe(1)

    const click = (label: string) => {
      const a = Array.from(root.querySelectorAll('a')).find((x) => x.textContent?.trim() === label)!
      a.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    }
    click('Runner')
    await Promise.resolve()
    expect(root.querySelector('.runner')).not.toBeNull()
    click('Waterfall')
    await Promise.resolve()
    click('Home')
    await Promise.resolve()
    expect(root.querySelector('.index')).not.toBeNull()

    // The stream opened once and was never torn down across three navigations.
    expect(opened).toBe(1)
    expect(closed).toBe(0)
  })

  it('mounts on a non-default base the way cloud does (bare <Dashboard>)', () => {
    // Cloud owns its LocationProvider and adds `:view?` to its own PR route,
    // then renders the bare <Dashboard> — no BrowserDashboard. Mirror that.
    const base = '/repo/acme/app/pr/42'
    history.replaceState(null, '', `${base}/runner`)
    const root = document.createElement('div')
    document.body.appendChild(root)
    render(
      <LocationProvider scope={base}>
        <Router>
          {[<Dashboard key="d" path={`${base}/:view?`} transport={stubTransport} basePath={base} />]}
        </Router>
      </LocationProvider>,
      root
    )
    expect(root.querySelector('.runner')).not.toBeNull()
    // The tab anchors are absolute under the PR mount, so they're deep-linkable.
    const runnerTab = Array.from(root.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Runner')
    expect(runnerTab?.getAttribute('href')).toBe(`${base}/runner`)
  })
})
