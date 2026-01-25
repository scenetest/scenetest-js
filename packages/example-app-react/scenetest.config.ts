import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  headed: true,
  timeout: 30000,
  actionTimeout: 5000,
})
