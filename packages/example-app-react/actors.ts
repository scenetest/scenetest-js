import type { TeamConfig } from '@scenecheck/scenes'

/**
 * Actor teams for scene tests.
 * Each team is a self-contained set of actors that can run scenes independently.
 * More teams = more parallel scene execution.
 */
export default [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
  },
  {
    user: { id: 'user-2', username: 'bob', email: 'bob@test.com' },
  },
] satisfies TeamConfig[]
