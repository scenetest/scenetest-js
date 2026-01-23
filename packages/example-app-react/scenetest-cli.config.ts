import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  casts: [
    {
      user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
    },
    {
      user: { id: 'user-2', username: 'bob', email: 'bob@test.com' },
    },
  ],

  headed: true,
  timeout: 30000,
  actionTimeout: 5000,
})
