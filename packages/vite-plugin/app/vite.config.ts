import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Build config for the dev console shell. Vite (Rollup) bundles the shell and
 * everything it imports — `@scenetest/dashboard`, `@tanstack/db`, preact — into
 * a static app under `dist-app/`, which the plugin middleware serves at
 * `/__scenetest/dashboard`. This is why there's no hand-rolled esbuild step,
 * importmap, or vendored-module serving: a real Vite app just gets bundled.
 *
 * `base` matches the serving path so the built asset URLs resolve under it.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/__scenetest/dashboard/',
  build: {
    outDir: fileURLToPath(new URL('../dist-app', import.meta.url)),
    emptyOutDir: true,
  },
})
