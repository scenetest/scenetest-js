import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [
    vue(),
    scenetest(),
  ],
})
