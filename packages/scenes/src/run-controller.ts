import type { Command } from '@scenetest/protocol'

export type RunControllerState = 'running' | 'paused' | 'stopped'

/** Optional notifications on real pause/resume transitions (e.g. to emit protocol events). */
export interface RunControllerHooks {
  onPaused?(): void
  onResumed?(): void
}

/**
 * In-process actuator for inbound protocol commands. The command-file watcher
 * (and, in dev, the Vite middleware) decode `Command`s and hand them here via
 * `dispatch()`; `SceneRunner` consults the result at each scene boundary.
 *
 * Commands target the active run — there's no run id; `meta.runId` is logged,
 * never required. pause/resume are cooperative (the runner parks between
 * scenes). stop ends the run gracefully. replay is the supervisor's job (a
 * relaunch), so it's a no-op here.
 */
export class RunController {
  private state: RunControllerState = 'running'
  private resumeWaiters: Array<() => void> = []

  constructor(private readonly hooks: RunControllerHooks = {}) {}

  get current(): RunControllerState {
    return this.state
  }

  get isStopped(): boolean {
    return this.state === 'stopped'
  }

  get isPaused(): boolean {
    return this.state === 'paused'
  }

  /** Park while paused; returns immediately when running or stopped. */
  async gate(): Promise<void> {
    while (this.state === 'paused') {
      await new Promise<void>((resolve) => this.resumeWaiters.push(resolve))
    }
  }

  pause(): void {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.hooks.onPaused?.()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'running'
    this.releaseWaiters()
    this.hooks.onResumed?.()
  }

  stop(): void {
    if (this.state === 'stopped') return
    this.state = 'stopped'
    this.releaseWaiters() // let a parked gate re-check and fall through
  }

  dispatch(command: Command, meta: { runId?: string } = {}): void {
    void meta
    switch (command.type) {
      case 'run:stop':
        this.stop()
        break
      case 'run:pause':
        this.pause()
        break
      case 'run:resume':
        this.resume()
        break
      case 'run:replay':
        // Replay is a relaunch (the supervisor spawns a fresh run); nothing to
        // do in a running process whose scenes are already module-cached.
        break
    }
  }

  private releaseWaiters(): void {
    const waiters = this.resumeWaiters
    this.resumeWaiters = []
    for (const resolve of waiters) resolve()
  }
}
