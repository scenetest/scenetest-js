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

describe('Dashboard routing: single Runner view on `{base}/:view?`', () => {
  it('renders the Runner at the base', () => {
    const root = mountAt('/__scenetest')
    expect(root.querySelector('.runner')).not.toBeNull()
    expect(root.querySelector('#run-select')).not.toBeNull() // Runner's run picker
  })

  it('renders the Runner at a trailing segment too (old deep-links resolve, no 404)', () => {
    const root = mountAt('/__scenetest/runner')
    expect(root.querySelector('.runner')).not.toBeNull()
  })

  it('has no nav tabs (the Runner is the whole app)', () => {
    const root = mountAt('/__scenetest')
    expect(root.querySelector('.dashboard-nav')).toBeNull()
    expect(root.querySelector('.tabs')).toBeNull()
    expect(root.querySelector('.index')).toBeNull()
  })

  it('builds the store once and never tears it down (stable mount)', () => {
    // createRunSource calls transport.subscribe once and its returned
    // unsubscribe on close. A single unconditionally-rendered view keeps the
    // component mounted, so this stays 1 / 0.
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
    expect(root.querySelector('.runner')).not.toBeNull()
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
  })
})
