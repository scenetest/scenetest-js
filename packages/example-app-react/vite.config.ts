import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scenecheck from '@scenecheck/vite'

export default defineConfig({
  plugins: [
    react(),
    scenecheck(),
  ],
})
