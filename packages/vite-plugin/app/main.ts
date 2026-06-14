/**
 * The dev console shell — a thin host around the `@scenetest/dashboard`
 * library, exactly analogous to scenetest-cloud's shell. It mounts the widget
 * with the SSE dev transport; cloud mounts the same library with a WebSocket
 * transport. Built by Vite to `../dist-app` and served by the plugin
 * middleware at `/__scenetest/dashboard`.
 */
import { mountDashboard, createDevTransport } from '@scenetest/dashboard'

const root = document.getElementById('root')
if (root) mountDashboard(root, { transport: createDevTransport() })
