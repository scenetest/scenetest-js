import { h, render } from 'preact'
import { Dashboard } from './app.js'
import { STYLES } from './styles.js'
import type { DashboardHandle, DashboardTheme, MountOptions } from './types.js'

/**
 * Mount the dashboard widget into `element`. The widget renders into a shadow
 * root with its own styles and fonts, so it can drop into any host — the
 * `/__scenetest` page, a worker-served page, a docs island — without leaking
 * styles in either direction and without the host needing to use Preact.
 *
 * The host supplies only a transport adapter (the dev/cloud seam) and an
 * optional theme; everything else is internal. Returns a handle whose
 * `unmount()` tears down Preact, the transport subscription, and the shadow
 * content.
 */
export function mountDashboard(element: HTMLElement, options: MountOptions): DashboardHandle {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
  root.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = STYLES
  root.appendChild(style)

  if (options.theme) applyTheme(root, options.theme)

  const container = document.createElement('div')
  root.appendChild(container)

  render(h(Dashboard, { transport: options.transport }), container)

  return {
    unmount() {
      render(null, container)
      root.innerHTML = ''
    },
  }
}

/**
 * Apply the small `--st-*` theming surface to the shadow host. A
 * `:host { ... }` block can't be set imperatively, so the custom properties
 * are written onto the host element's inline style, where `:host` rules in the
 * stylesheet pick them up as overrides.
 */
function applyTheme(root: ShadowRoot, theme: DashboardTheme): void {
  const host = root.host as HTMLElement
  if (theme.bg) host.style.setProperty('--st-bg', theme.bg)
  if (theme.accent) host.style.setProperty('--st-accent', theme.accent)
  if (theme.font) host.style.setProperty('--st-font', theme.font)
  if (theme.fontSize) host.style.setProperty('--st-font-size', theme.fontSize)
}
