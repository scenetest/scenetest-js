// Type augmentation for scenecheck ServerContext
// This declares the server functions available in serverFn

export {}

declare module '@scenecheck/checks-react' {
  interface ServerContext {
    getServerTime: () => number
    validateEmail: (email: string) => boolean
  }
}
