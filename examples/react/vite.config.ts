import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    scenetest(),
  ],
})
