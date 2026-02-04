import { defineConfig } from '@scenetest/scenes'

// Type augmentation — provides type safety in serverCheck() serverFn
declare module '@scenetest/checks' {
  interface ServerContext {
    validateEmail: (email: string) => boolean
    getProfile: (userId: string) => Promise<{
      id: string
      name: string
      email: string
      updated_at: string
    }>
  }
}

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  headed: true,
  timeout: 30000,
  actionTimeout: 5000,

  serverFunctions: {
    validateEmail: (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    },

    getProfile: async (userId: string) => {
      return {
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
        updated_at: new Date().toISOString(),
      }
    },
  },
})
