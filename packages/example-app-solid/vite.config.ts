import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import scenecheck from '@scenecheck/vite'

export default defineConfig({
  plugins: [
    solid(),
    scenecheck(),
  ],
})
