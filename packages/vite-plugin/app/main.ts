/**
 * The dev shell — a thin host around the `@scenetest/dashboard` app (Home /
 * Runner / Waterfall views over the read-only TanStack DB read model), exactly
 * analogous to scenetest-cloud's shell. It mounts the dashboard with the SSE
 * dev transport; cloud mounts the same library with a WebSocket transport.
 * Built by Vite to `../dist-app` and served by the plugin middleware.
 */
import { mountDashboard, createDevTransport } from '@scenetest/dashboard'

const root = document.getElementById('root')
if (root) mountDashboard(root, { transport: createDevTransport() })
