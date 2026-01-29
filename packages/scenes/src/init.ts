import fs from 'fs'
import path from 'path'

const CONFIG_TEMPLATE = `import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  // Base URL for your application
  // baseUrl: 'http://localhost:3000',

  // Browser settings
  // headed: false,
  // timeout: 30000,

  // Selector aliases
  // aliases: {
  //   modal: '[role=dialog]',
  //   nav: '[role=navigation]',
  // },
})
`

const README_TEMPLATE = `# Scenetest

This folder contains your scenetest configuration and specs.

## Structure

\`\`\`
scenetest/
├── config.ts       # Configuration (aliases, baseUrl, etc.)
├── actors/         # Actor definitions (optional)
├── specs/          # Your .spec.ts and .spec.md files
└── .cache/         # Generated files (gitignored)
\`\`\`

## Quick start

\`\`\`bash
# Run all specs
npx scenetest

# Run specific spec
npx scenetest scenetest/specs/login.spec.md

# Run with visible browser
npx scenetest --headed
\`\`\`

## Documentation

See https://scenetest.dev for full documentation.
`

const README_LLM_TEMPLATE = `# Scenetest (for LLMs)

Scenetest is an E2E testing framework with a text-based DSL for writing scene specs.

## Key concepts

- **Scenes**: Test scenarios with one or more actors
- **Actors**: Browser instances that perform actions
- **Selectors**: Space-separated tokens that resolve to DOM elements (data-testid, aria-label, id, etc.)

## Text DSL grammar

\`\`\`
<action> [<selector>] [<value>]

Actions:
  openTo <url>              Navigate to URL
  see <selector>            Wait for element visible (updates scope)
  seeInView <selector>      Wait for element visible in viewport
  notSee <selector>         Wait for element hidden
  seeText <text>            Wait for text visible
  click [<selector>]        Click element (bare click = current scope)
  typeInto <selector> <value>   Fill input
  check <selector>          Check checkbox
  select <selector> <value>     Select dropdown option
  wait <ms>                 Wait milliseconds
  emit <message>            Emit to message bus
  waitFor <message>         Block until message arrives
  up [<selector>]           Navigate scope up (bare up = reset to root)
  prev                      Return to previous scope
\`\`\`

## .spec.md format

\`\`\`markdown
# Group name

## Scene name
actor-name:
- openTo /login
- see login-form
- typeInto email [self.email]
- typeInto password [self.password]
- click submit
- see dashboard
\`\`\`

## Interpolation

- \`[self.field]\` — current actor's fields
- \`[role.field]\` — another actor's fields
- \`[team.field]\` — team metadata

## Selectors

Selectors match: data-testid, aria-label, id, data-name, data-key, name

Sigils:
- \`~alias\` — config alias lookup
- \`@label\` — explicit aria-label match

## Files in this folder

- \`config.ts\` — configuration (aliases, baseUrl, timeouts)
- \`specs/\` — scene spec files (.spec.ts, .spec.md)
- \`.cache/\` — generated files (selectors.json manifest)
`

export interface InitOptions {
  force?: boolean
}

export async function init(cwd: string, options: InitOptions = {}): Promise<void> {
  const scenetestDir = path.join(cwd, 'scenetest')

  // Check if already exists
  if (fs.existsSync(scenetestDir) && !options.force) {
    const configExists = fs.existsSync(path.join(scenetestDir, 'config.ts'))
    if (configExists) {
      console.log('scenetest/ folder already exists. Use --force to overwrite.')
      return
    }
  }

  // Create directories
  const dirs = [
    scenetestDir,
    path.join(scenetestDir, 'specs'),
    path.join(scenetestDir, '.cache'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // Write files
  const files = [
    { path: path.join(scenetestDir, 'config.ts'), content: CONFIG_TEMPLATE },
    { path: path.join(scenetestDir, 'README.md'), content: README_TEMPLATE },
    { path: path.join(scenetestDir, 'README-LLM.md'), content: README_LLM_TEMPLATE },
    { path: path.join(scenetestDir, '.cache', '.gitkeep'), content: '' },
  ]

  for (const file of files) {
    if (!fs.existsSync(file.path) || options.force) {
      fs.writeFileSync(file.path, file.content)
    }
  }

  // Add to .gitignore if it exists
  const gitignorePath = path.join(cwd, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8')
    if (!gitignore.includes('scenetest/.cache')) {
      fs.appendFileSync(gitignorePath, '\n# Scenetest generated files\nscenetest/.cache/\n')
      console.log('Added scenetest/.cache/ to .gitignore')
    }
  }

  console.log(`
Created scenetest/ folder:
  scenetest/
  ├── config.ts        # Configuration
  ├── README.md        # Documentation
  ├── README-LLM.md    # LLM instructions
  ├── specs/           # Put your .spec.md files here
  └── .cache/          # Generated files (gitignored)

Next steps:
  1. Edit scenetest/config.ts to set your baseUrl
  2. Create a spec in scenetest/specs/
  3. Run: npx scenetest
`)
}
