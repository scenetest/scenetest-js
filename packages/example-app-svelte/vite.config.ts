import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import scenetest from 'vite-plugin-scenetest-js'

export default defineConfig({
  plugins: [
    svelte(),
    scenetest(),
  ],
})
