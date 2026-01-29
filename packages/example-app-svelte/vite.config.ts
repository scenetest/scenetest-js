import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import scenecheck from '@scenecheck/vite'

export default defineConfig({
  plugins: [
    svelte(),
    scenecheck(),
  ],
})
