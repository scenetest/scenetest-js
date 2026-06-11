import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [
    preact(),
    scenetest(),
  ],
})
