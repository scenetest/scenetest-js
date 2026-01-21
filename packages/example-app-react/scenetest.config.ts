import { defineScenetestConfig, pass } from 'vite-plugin-scenetest'

export default defineScenetestConfig({
  serverFunctions: {
    getServerTime: () => Date.now(),
    validateEmail: (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    },
  },
})
