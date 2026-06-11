import { getRequestListener } from '@hono/node-server'
import type { Hono } from 'hono'

/**
 * Adapt a Hono app to a Node `(req, res)` request listener so it can
 * mount inside a connect-style server (e.g. Vite's dev server
 * middleware stack). The caller is responsible for routing/prefix
 * stripping — rewrite `req.url` to the app-relative path before
 * delegating.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toNodeHandler(app: Hono<any, any, any>): ReturnType<typeof getRequestListener> {
  return getRequestListener(app.fetch)
}
