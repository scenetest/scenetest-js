import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import scenetest from 'vite-plugin-scenetest-js'

export default defineConfig({
  plugins: [
    vue(),
    scenetest(),
  ],
})
