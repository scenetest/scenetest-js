/**
 * Message bus for inter-actor coordination.
 *
 * Key behavior: Messages are "sticky" - they persist on the bus.
 * If you listen AFTER a message was emitted, you still receive it (once).
 * This prevents race conditions when declaring causality early in scenes.
 */
export class MessageBus {
  private emittedMessages = new Set<string>()
  private listeners = new Map<string, Array<() => void>>()

  /**
   * Emit a message to the bus.
   * All current and future listeners for this message will be triggered.
   */
  emit(message: string): void {
    this.emittedMessages.add(message)

    // Trigger any waiting listeners
    const callbacks = this.listeners.get(message)
    if (callbacks) {
      for (const cb of callbacks) {
        cb()
      }
      this.listeners.delete(message)
    }
  }

  /**
   * Wait for a message to be emitted.
   * If the message was already emitted, resolves immediately.
   */
  waitFor(message: string, timeout = 30000): Promise<void> {
    // If already emitted, resolve immediately (sticky behavior)
    if (this.emittedMessages.has(message)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this listener on timeout
        const callbacks = this.listeners.get(message)
        if (callbacks) {
          const index = callbacks.indexOf(callback)
          if (index !== -1) {
            callbacks.splice(index, 1)
          }
          if (callbacks.length === 0) {
            this.listeners.delete(message)
          }
        }
        reject(new Error(`Timeout waiting for message: "${message}"`))
      }, timeout)

      const callback = () => {
        clearTimeout(timer)
        resolve()
      }

      const callbacks = this.listeners.get(message) || []
      callbacks.push(callback)
      this.listeners.set(message, callbacks)
    })
  }

  /**
   * Check if a message has been emitted.
   */
  hasEmitted(message: string): boolean {
    return this.emittedMessages.has(message)
  }

  /**
   * Clear all messages and listeners.
   * Call this between scene runs.
   */
  clear(): void {
    this.emittedMessages.clear()
    this.listeners.clear()
  }
}
