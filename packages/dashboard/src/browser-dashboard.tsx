import { LocationProvider, Router } from 'preact-iso'
import { Dashboard } from './dashboard.js'
import type { Transport } from './types.js'

/** Where the dashboard mounts when it *is* the app: the dev shell renders here
 * and the Vite middleware serves it. Fixed — an app that mounts elsewhere
 * (cloud) renders <Dashboard basePath={…} /> under its own route instead. */
const URL_BASE = '/__scenetest'

/**
 * Standalone entry point: wraps `<Dashboard>` in the one `preact-iso`
 * `LocationProvider` + `Router` a top-level app must own, mounted on
 * `{URL_BASE}/:view?` so the optional param selects the view. Use it when the
 * dashboard is the whole app — `render(<BrowserDashboard transport={…} />)` (the
 * dev shell). It exists to keep `preact-iso` and the `:view?` route contract
 * inside this package, so the shell needs neither. An app that already owns a
 * `LocationProvider` (cloud) skips this and renders `<Dashboard>` directly.
 */
export function BrowserDashboard({ transport }: { transport: Transport }) {
  return (
    <LocationProvider scope={URL_BASE}>
      <Router>
        {[<Dashboard key="app" path={`${URL_BASE}/:view?`} transport={transport} basePath={URL_BASE} />]}
      </Router>
    </LocationProvider>
  )
}
