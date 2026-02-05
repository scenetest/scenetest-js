import fs from 'fs'
import path from 'path'

interface InitOptions {
  force?: boolean
}

/**
 * Initialize scenetest folder structure in the given directory.
 *
 * Creates:
 *   scenetest/
 *     config.ts    — project config
 *     scenes/      — scene spec files (.spec.ts, .spec.md)
 *     actors/      — actor team files (one file per team)
 */
export async function init(cwd: string, options: InitOptions = {}): Promise<void> {
  const scenetestDir = path.join(cwd, 'scenetest')
  const scenesDir = path.join(scenetestDir, 'scenes')
  const actorsDir = path.join(scenetestDir, 'actors')
  const configPath = path.join(scenetestDir, 'config.ts')

  if (!options.force && fs.existsSync(scenetestDir)) {
    console.log('scenetest/ directory already exists. Use --force to overwrite.')
    return
  }

  fs.mkdirSync(scenesDir, { recursive: true })
  fs.mkdirSync(actorsDir, { recursive: true })

  if (!fs.existsSync(configPath) || options.force) {
    fs.writeFileSync(configPath, `import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
})
`)
    console.log('Created scenetest/config.ts')
  }

  // Seed a starter actors file
  const actorsFile = path.join(actorsDir, 'default.ts')
  if (!fs.existsSync(actorsFile) || options.force) {
    fs.writeFileSync(actorsFile, `import type { TeamConfig } from '@scenetest/scenes'

export default [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
  },
  {
    user: { id: 'user-2', username: 'bob', email: 'bob@test.com' },
  },
] satisfies TeamConfig[]
`)
    console.log('Created scenetest/actors/default.ts')
  }

  console.log('Created scenetest/ directory')
  console.log('Run `pnpm scenetest` to start running scene specs.')
}
