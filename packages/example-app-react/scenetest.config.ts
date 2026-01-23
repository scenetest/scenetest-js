import { defineScenetestConfig, should } from '@scenetest/vite-plugin'

export default defineScenetestConfig({
  serverFunctions: {
    getServerTime: () => Date.now(),
    validateEmail: (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    },
  },
})
