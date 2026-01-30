import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { execSync } from 'child_process'

const gitCommit = execSync('git rev-parse --short HEAD').toString().trim()

export default defineConfig(({ command }) => ({
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      srcDirectory: 'app',
    }),
    viteReact(),
    // Nitro is only needed at build time (Vercel SSR deployment).
    // In dev, Vite's built-in SPA fallback serves index.html for all
    // routes so client-side routing works on direct navigation.
    command === 'build' ? nitro() : null,
  ],
}))
