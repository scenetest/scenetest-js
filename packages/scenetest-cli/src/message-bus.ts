import type { SceneEvent } from './types.js'

/**
 * Message bus for inter-actor coordination.
 *
 * Key behavior: Messages are "sticky" - they persist on the bus.
 * If you listen AFTER a message was emitted, you still receive it (once).
 * This prevents race conditions when declaring causality early in scenes.
 *
 * Supports both simple string messages and rich SceneEvent objects for
 * narrative event descriptions like "user-1 goes into the elevator".
 */
export class MessageBus {
  private emittedMessages = new Set<string>()
  private emittedEvents: SceneEvent[] = []
  private listeners = new Map<string, Array<() => void>>()
  private eventListeners: Array<{ predicate: (e: SceneEvent) => boolean; callback: () => void }> = []

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
   * Emit a rich event object with actor and optional data.
   * Also emits the event name as a simple message for backward compatibility.
   *
   * @example
   * ```ts
   * bus.emitEvent({
   *   name: 'user-1 goes into the elevator',
   *   actor: 'user-1',
   *   data: { floor: 3 },
   *   timestamp: Date.now()
   * })
   * ```
   */
  emitEvent(event: SceneEvent): void {
    this.emittedEvents.push(event)

    // Also emit as simple message for backward compatibility with when()
    this.emit(event.name)

    // Trigger any event listeners that match
    const matchingListeners = this.eventListeners.filter((l) => l.predicate(event))
    for (const listener of matchingListeners) {
      listener.callback()
    }
    // Remove triggered listeners
    this.eventListeners = this.eventListeners.filter((l) => !matchingListeners.includes(l))
  }

  /**
   * Wait for an event matching the predicate.
   * If a matching event was already emitted, resolves immediately.
   *
   * @example
   * ```ts
   * // Wait for any event from user-1
   * await bus.waitForEvent(e => e.actor === 'user-1')
   *
   * // Wait for specific event with data
   * await bus.waitForEvent(e =>
   *   e.name === 'user-1 goes into the elevator' &&
   *   e.data?.floor === 3
   * )
   * ```
   */
  waitForEvent(predicate: (e: SceneEvent) => boolean, timeout = 30000): Promise<SceneEvent> {
    // Check if a matching event was already emitted
    const existing = this.emittedEvents.find(predicate)
    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove this listener on timeout
        const index = this.eventListeners.findIndex((l) => l.callback === callback)
        if (index !== -1) {
          this.eventListeners.splice(index, 1)
        }
        reject(new Error('Timeout waiting for event'))
      }, timeout)

      const callback = () => {
        clearTimeout(timer)
        // Find the matching event that triggered this
        const event = this.emittedEvents.find(predicate)
        if (event) {
          resolve(event)
        }
      }

      this.eventListeners.push({ predicate, callback })
    })
  }

  /**
   * Get all emitted events.
   */
  getEvents(): readonly SceneEvent[] {
    return this.emittedEvents
  }

  /**
   * Get events for a specific actor.
   */
  getActorEvents(actor: string): SceneEvent[] {
    return this.emittedEvents.filter((e) => e.actor === actor)
  }

  /**
   * Clear all messages and listeners.
   * Call this between scene runs.
   */
  clear(): void {
    this.emittedMessages.clear()
    this.emittedEvents = []
    this.listeners.clear()
    this.eventListeners = []
  }
}

/**
 * The when() function for coordinating between actors.
 *
 * @example
 * ```ts
 * // String trigger, function action
 * when(bus, 'user2 accepts', async () => {
 *   await user1.seeId('notification')
 * })
 *
 * // Function trigger, string action
 * when(bus, () => user2.seeId('toast'), 'user2 accepts')
 * ```
 */
export function when(
  bus: MessageBus,
  trigger: string | (() => Promise<void>),
  action: string | (() => Promise<void>)
): void {
  const executeAction = async () => {
    if (typeof action === 'string') {
      bus.emit(action)
    } else {
      await action()
    }
  }

  if (typeof trigger === 'string') {
    // Wait for message, then execute action
    bus.waitFor(trigger).then(executeAction).catch((err) => {
      console.error(`when() error waiting for "${trigger}":`, err.message)
    })
  } else {
    // Execute trigger function, then execute action
    trigger().then(executeAction).catch((err) => {
      console.error('when() error executing trigger:', err.message)
    })
  }
}
