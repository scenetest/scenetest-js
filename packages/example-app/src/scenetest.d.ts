// Type augmentation for scenetest ServerContext
// This declares the server functions available in assertFn

import 'scenetest'

declare module 'scenetest' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}
