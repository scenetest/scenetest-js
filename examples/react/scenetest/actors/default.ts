import type { TeamConfig } from '@scenetest/scenes'

/**
 * Actor teams for scene tests.
 * Each team is a self-contained set of actors that can run scenes independently.
 * More teams = more parallel scene execution.
 */
export default [
  {
    user: { key: 'user-1', username: 'alice', email: 'alice@test.com' },
  },
  {
    user: { key: 'user-2', username: 'bob', email: 'bob@test.com' },
  },
] satisfies TeamConfig[]
