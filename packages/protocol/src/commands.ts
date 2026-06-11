/**
 * The command vocabulary of the scenetest protocol.
 *
 * Commands flow the reverse path of events: a human acting on the
 * dashboard → transport adapter → backend → down to the CLI, which
 * executes and emits resulting events back up.
 *
 * In dev mode the Vite middleware maps these onto its HTTP endpoints
 * (`/__scenetest/replay`, `/stop`, `/pause`); in cloud they ride the
 * runner box's WebSocket back down from the run's Durable Object command
 * queue. The same versioning rules as events apply (see events.ts).
 */

/**
 * Start (or restart) a run. Both fields optional: omit `file` to run all
 * scenes, omit `team` to run every team.
 */
export interface RunReplayCommand {
  type: 'run:replay'
  /** Scene file to run, relative to the scenes directory. */
  file?: string
  /** Restrict the run to one team by name. */
  team?: string
}

/** Stop the active run. */
export interface RunStopCommand {
  type: 'run:stop'
}

/** Suspend the active run without tearing it down. */
export interface RunPauseCommand {
  type: 'run:pause'
}

/** Resume a paused run. */
export interface RunResumeCommand {
  type: 'run:resume'
}

/** Every command a viewer can send toward a runner. */
export type Command =
  | RunReplayCommand
  | RunStopCommand
  | RunPauseCommand
  | RunResumeCommand

/** All known command type tags. */
export const COMMAND_TYPES = [
  'run:replay',
  'run:stop',
  'run:pause',
  'run:resume',
] as const satisfies readonly Command['type'][]
