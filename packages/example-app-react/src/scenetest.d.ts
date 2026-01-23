// Type augmentation for scenetest ServerContext
// This declares the server functions available in serverFn

import 'scenetest-js'

declare module 'scenetest-js' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}
