import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import scenetest from '@mhsnook/vite-plugin-scenetest'

export default defineConfig({
  plugins: [
    solid(),
    scenetest(),
  ],
})
