import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [
    solid(),
    scenetest(),
  ],
})
