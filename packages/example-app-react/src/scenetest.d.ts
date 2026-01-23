// Type augmentation for scenetest ServerContext
// This declares the server functions available in serverFn

import '@mhsnook/scenetest'

declare module '@mhsnook/scenetest' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}
