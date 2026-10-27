/**
 * The dev shell — a thin host around the `@scenetest/dashboard` app (Home +
 * Runner over the read-only TanStack DB read model). It
 * renders `BrowserDashboard` — `<Dashboard>` plus the single `preact-iso`
 * `LocationProvider` a top-level app must own — so the shell stays a one-liner.
 * Cloud, which already owns a `LocationProvider`, renders the bare `<Dashboard>`
 * under its own route instead. Built by Vite to `../dist-app` and served at all
 * view routes by the plugin middleware.
 */
import { render } from 'preact'
import { BrowserDashboard, createDevTransport } from '@scenetest/dashboard'
import '@scenetest/dashboard/style.css'

const root = document.getElementById('root')
if (root) render(<BrowserDashboard transport={createDevTransport()} />, root)
