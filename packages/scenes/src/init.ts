import fs from 'fs'
import path from 'path'

interface InitOptions {
  force?: boolean
}

/**
 * Initialize scenetest folder structure in the given directory.
 */
export async function init(cwd: string, options: InitOptions = {}): Promise<void> {
  const scenesDir = path.join(cwd, 'scenes')
  const configPath = path.join(cwd, 'scenetest.config.ts')

  if (!options.force && fs.existsSync(scenesDir)) {
    console.log('scenes/ directory already exists. Use --force to overwrite.')
    return
  }

  fs.mkdirSync(scenesDir, { recursive: true })

  if (!fs.existsSync(configPath) || options.force) {
    fs.writeFileSync(configPath, `import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
})
`)
    console.log('Created scenetest.config.ts')
  }

  console.log('Created scenes/ directory')
  console.log('Run `pnpm scenetest` to start running scene specs.')
}
