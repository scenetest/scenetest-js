import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import scenetest from 'vite-plugin-scenetest'

export default defineConfig({
  plugins: [
    vue(),
    scenetest(),
  ],
})
