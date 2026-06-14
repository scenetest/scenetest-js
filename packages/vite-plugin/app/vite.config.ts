import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Build config for the dev dashboard shell. Vite (Rollup) bundles the shell and
 * everything it imports — `@scenetest/dashboard`, `@tanstack/db`, preact — into
 * a static app under `dist-app/`, which the plugin middleware serves under
 * `/__scenetest`. This is why there's no hand-rolled esbuild step, importmap,
 * or vendored-module serving: a real Vite app just gets bundled.
 *
 * `base` is the serving prefix, so built asset URLs resolve to
 * `/__scenetest/assets/…` (which the middleware serves off dist-app).
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/__scenetest/',
  build: {
    outDir: fileURLToPath(new URL('../dist-app', import.meta.url)),
    emptyOutDir: true,
  },
})
