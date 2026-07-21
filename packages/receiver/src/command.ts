import type { Command } from '@scenetest/protocol'

/**
 * Metadata alongside an inbound command. `runId` is bookkeeping, never the
 * address — commands act on the host's active run, so it's optional.
 */
export interface CommandMeta {
  runId?: string
}

/**
 * Handler the host wires into the receiver to act on inbound commands. The
 * receiver only decodes and routes; actuation is process-local (dev: child
 * process; box/CLI: the run controller). Fire-and-forget — a throwing handler
 * surfaces as `{ ok: false }`, not a 5xx.
 */
export type CommandHandler = (command: Command, meta: CommandMeta) => void | Promise<void>

