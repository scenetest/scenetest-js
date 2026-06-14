/**
 * The dev shell — a thin host around the `@scenetest/dashboard` app (Home /
 * Runner / Waterfall views over the read-only TanStack DB read model), exactly
 * analogous to scenetest-cloud's shell. The dashboard is a plain Preact
 * component, so the shell just renders it with the SSE dev transport; cloud
 * renders the same component with a WebSocket transport. Built by Vite to
 * `../dist-app` and served by the plugin middleware.
 */
import { render } from 'preact'
import { Dashboard, createDevTransport } from '@scenetest/dashboard'
import '@scenetest/dashboard/style.css'

const root = document.getElementById('root')
if (root) render(<Dashboard transport={createDevTransport()} />, root)
