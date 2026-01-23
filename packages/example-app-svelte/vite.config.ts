import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [
    svelte(),
    scenetest(),
  ],
})
