import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import scenetest from '@mhsnook/vite-plugin-scenetest'

export default defineConfig({
  plugins: [
    vue(),
    scenetest(),
  ],
})
