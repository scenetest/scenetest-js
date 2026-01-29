import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import scenecheck from '@scenecheck/vite'

export default defineConfig({
  plugins: [
    vue(),
    scenecheck(),
  ],
})
