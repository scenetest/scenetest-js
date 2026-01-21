import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import scenetest from 'vite-plugin-scenetest'

export default defineConfig({
  plugins: [
    solid(),
    scenetest(),
  ],
})
