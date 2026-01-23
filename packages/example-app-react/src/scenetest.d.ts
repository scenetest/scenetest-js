// Type augmentation for scenetest ServerContext
// This declares the server functions available in serverFn

export {}

declare module '@scenetest/core' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}

declare module '@scenetest/react' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}
