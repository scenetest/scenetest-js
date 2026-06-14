/**
 * The dev console shell — a thin host around the `@scenetest/dashboard`
 * library's unified console (Home / Runner / Waterfall), exactly analogous to
 * scenetest-cloud's shell. It mounts the console with the SSE dev transport;
 * cloud mounts the same library with a WebSocket transport. Built by Vite to
 * `../dist-app` and served by the plugin middleware at `/__scenetest`.
 */
import { mountConsole, createDevTransport } from '@scenetest/dashboard'

const root = document.getElementById('root')
if (root) mountConsole(root, { transport: createDevTransport() })
