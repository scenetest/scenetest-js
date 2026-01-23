import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scenetest from '@mhsnook/vite-plugin-scenetest'

export default defineConfig({
  plugins: [
    react(),
    scenetest(),
  ],
})
