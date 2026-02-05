/**
 * LLM Prompt Generator for Team/Seed Data Creation
 *
 * Analyzes the user's project and generates context-rich prompts that can be
 * fed to an LLM (Claude, GPT, etc.) to generate team configurations and
 * corresponding seed data for scenetest.
 *
 * The generator scans for:
 * - User/account models (TypeScript types, Prisma schema, etc.)
 * - Database schemas
 * - Existing seeds
 * - Existing actor team files (scenetest/actors/)
 * - Existing scene specs (scenetest/scenes/)
 * - Auth-related files
 */

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'

export interface PromptContext {
  projectName: string
  packageJson?: Record<string, unknown>
  userModels: FileContent[]
  existingSeeds: FileContent[]
  existingActors: FileContent[]
  existingScenes: FileContent[]
  authPatterns: FileContent[]
  dbSchema: FileContent[]
  configFile: FileContent | null
}

export interface FileContent {
  path: string
  content: string
}

export type PromptType = 'teams' | 'seeds' | 'both'

/**
 * Gather project context for prompt generation.
 *
 * Scans the project for relevant files that an LLM would need to understand
 * the application's user model, data layer, and existing test setup.
 */
export async function gatherProjectContext(configPath?: string): Promise<PromptContext> {
  const cwd = process.cwd()
  const projectName = path.basename(cwd)

  // Try to load package.json
  let packageJson: Record<string, unknown> | undefined
  const pkgPath = path.join(cwd, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    } catch {
      // Ignore parse errors
    }
  }

  // Find scenetest config (new location: scenetest/config.ts)
  const configFile = await findFile(cwd, [
    'scenetest/config.ts',
    'scenetest/config.js',
    'scenetest/config.mjs',
  ])

  // Find existing actor team files (new location: scenetest/actors/)
  const existingActors = await findFilesMatching(cwd, [
    'scenetest/actors/*.ts',
    'scenetest/actors/*.js',
    'scenetest/actors/*.mjs',
  ])

  // Find user models (common patterns)
  const userModels = await findFilesMatching(cwd, [
    '**/models/user*.ts',
    '**/models/User*.ts',
    '**/types/user*.ts',
    '**/types/User*.ts',
    '**/schema/user*.ts',
    '**/schema/User*.ts',
    '**/entities/user*.ts',
    '**/entities/User*.ts',
    '**/prisma/schema.prisma',
    '**/drizzle/schema*.ts',
    '**/db/schema*.ts',
  ])

  // Find existing seeds
  const existingSeeds = await findFilesMatching(cwd, [
    '**/seeds/**/*.ts',
    '**/seeds/**/*.js',
    '**/seed/**/*.ts',
    '**/seed/**/*.js',
    '**/prisma/seed.ts',
    '**/prisma/seed.js',
    '**/db/seed*.ts',
    '**/db/seed*.js',
  ])

  // Find existing scenes (to understand what roles are used)
  const existingScenes = await findFilesMatching(
    cwd,
    ['scenetest/scenes/**/*.spec.ts', 'scenetest/scenes/**/*.spec.md'],
    5
  )

  // Find auth-related files
  const authPatterns = await findFilesMatching(cwd, [
    '**/auth/**/*.ts',
    '**/auth.ts',
    '**/authentication*.ts',
    '**/login*.ts',
    '**/middleware/auth*.ts',
  ])

  // Find database schema files
  const dbSchema = await findFilesMatching(cwd, [
    '**/prisma/schema.prisma',
    '**/drizzle/schema*.ts',
    '**/drizzle/*.ts',
    '**/db/schema*.ts',
    '**/schema.sql',
    '**/migrations/*.sql',
  ])

  return {
    projectName,
    packageJson,
    userModels,
    existingSeeds,
    existingActors,
    existingScenes,
    authPatterns,
    dbSchema,
    configFile,
  }
}

async function findFile(cwd: string, patterns: string[]): Promise<FileContent | null> {
  for (const pattern of patterns) {
    const fullPath = path.join(cwd, pattern)
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        return { path: pattern, content: truncateContent(content) }
      } catch {
        // Ignore read errors
      }
    }
  }
  return null
}

async function findFilesMatching(
  cwd: string,
  patterns: string[],
  maxFiles = 10
): Promise<FileContent[]> {
  const results: FileContent[] = []
  const seen = new Set<string>()

  for (const pattern of patterns) {
    if (results.length >= maxFiles) break

    try {
      const files = await glob(pattern, {
        cwd,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
        absolute: false,
      })

      for (const file of files) {
        if (results.length >= maxFiles) break
        if (seen.has(file)) continue
        seen.add(file)

        const fullPath = path.join(cwd, file)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          results.push({ path: file, content: truncateContent(content) })
        } catch {
          // Ignore read errors
        }
      }
    } catch {
      // Ignore glob errors
    }
  }

  return results
}

function truncateContent(content: string, maxLines = 150): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines)`
}

// ─── Prompt generators ──────────────────────────────────────────────────────

/**
 * Generate an LLM prompt for team/actor generation
 */
export function generateTeamsPrompt(ctx: PromptContext): string {
  const sections: string[] = []

  sections.push(`# Generate Scenetest Actor Teams

I need help creating scenetest team configurations for my project.

## Project: ${ctx.projectName}
`)

  if (ctx.packageJson) {
    const deps = {
      ...(ctx.packageJson.dependencies as Record<string, string> | undefined),
      ...(ctx.packageJson.devDependencies as Record<string, string> | undefined),
    }
    const relevantDeps = Object.keys(deps).filter(
      (d) =>
        d.includes('prisma') ||
        d.includes('drizzle') ||
        d.includes('sequelize') ||
        d.includes('typeorm') ||
        d.includes('mongoose') ||
        d.includes('auth') ||
        d.includes('passport') ||
        d.includes('next-auth') ||
        d.includes('lucia') ||
        d.includes('clerk')
    )
    if (relevantDeps.length > 0) {
      sections.push(`**Relevant dependencies:** ${relevantDeps.join(', ')}\n`)
    }
  }

  if (ctx.userModels.length > 0) {
    sections.push(`## User/Account Models\n`)
    for (const model of ctx.userModels) {
      sections.push(`### ${model.path}\n\`\`\`\n${model.content}\n\`\`\`\n`)
    }
  }

  if (ctx.dbSchema.length > 0) {
    sections.push(`## Database Schema\n`)
    for (const schema of ctx.dbSchema.slice(0, 3)) {
      sections.push(`### ${schema.path}\n\`\`\`\n${schema.content}\n\`\`\`\n`)
    }
  }

  if (ctx.existingActors.length > 0) {
    sections.push(`## Existing Actor Teams (for reference)\n`)
    for (const actor of ctx.existingActors) {
      sections.push(`### ${actor.path}\n\`\`\`typescript\n${actor.content}\n\`\`\`\n`)
    }
  }

  if (ctx.existingScenes.length > 0) {
    sections.push(`## Existing Scenes (to understand what roles are used)\n`)
    for (const scene of ctx.existingScenes.slice(0, 3)) {
      sections.push(`### ${scene.path}\n\`\`\`\n${scene.content}\n\`\`\`\n`)
    }
  }

  sections.push(`## Scenetest Team Format

Teams live in \`scenetest/actors/\`, one file per team. Each file exports a single team object mapping role names to actor configs.

### File structure

\`\`\`
your-project/
  scenetest/
    config.ts
    actors/
      team-maria.ts      ← one team per file
      team-john.ts
    scenes/
      ...
\`\`\`

### Team file format

\`\`\`typescript
// scenetest/actors/team-maria.ts
import type { TeamConfig } from '@scenetest/scenes'

export default {
  'primary-learner': {
    key: 'maria-1',             // Unique key (used for data-key matching in DOM)
    email: 'maria@test.com',
    password: 'test123',
    nativeLanguage: 'english',  // Custom fields are allowed
  },
  'existing-friend': {
    key: 'carlos-1',
    email: 'carlos@test.com',
    password: 'test123',
  },
  'new-signup': {
    key: 'fresh-a-1',
    email: 'fresh-a@test.com',
    password: 'willregister123',
  },
} satisfies TeamConfig
\`\`\`

### Key requirements

- **Every team must have identical role names** — scenes call \`actor('role-name')\`, and that role must exist in every team
- **\`key\`** is the only required field on ActorConfig (used for data-key selector matching)
- Credentials (\`email\`, \`password\`, \`username\`) must match seed data users
- Relationships (friendships, org membership, etc.) between actors must exist in seed data
- Each team is a self-contained "world" — no cross-team references
- Use descriptive role names: \`primary-buyer\`, \`competing-seller\`, not \`user\`, \`admin\`

## What I Need

Generate actor team files for my project:
1. Identify the user types and relationships in my app
2. Create 2-3 team files in \`scenetest/actors/\`
3. Use descriptive, scenario-based role names
4. Include all credential fields my app needs
5. Note what relationships need to exist in seed data
`)

  return sections.join('\n')
}

/**
 * Generate an LLM prompt for seed data generation
 */
export function generateSeedsPrompt(ctx: PromptContext): string {
  const sections: string[] = []

  sections.push(`# Generate Seed Data for Scenetest Teams

I need help creating seed data that matches my scenetest actor teams.

## Project: ${ctx.projectName}
`)

  if (ctx.existingActors.length > 0) {
    sections.push(`## Actor Team Files\n`)
    for (const actor of ctx.existingActors) {
      sections.push(`### ${actor.path}\n\`\`\`typescript\n${actor.content}\n\`\`\`\n`)
    }
  } else {
    sections.push(`## Actor Teams

**No actor files found in \`scenetest/actors/\`.** Please either:
1. First generate team configurations (\`scenetest prompt teams\`)
2. Or paste your team files here
`)
  }

  if (ctx.dbSchema.length > 0) {
    sections.push(`## Database Schema\n`)
    for (const schema of ctx.dbSchema) {
      sections.push(`### ${schema.path}\n\`\`\`\n${schema.content}\n\`\`\`\n`)
    }
  }

  if (ctx.existingSeeds.length > 0) {
    sections.push(`## Existing Seed Files (for style reference)\n`)
    for (const seed of ctx.existingSeeds.slice(0, 3)) {
      sections.push(`### ${seed.path}\n\`\`\`\n${seed.content}\n\`\`\`\n`)
    }
  }

  if (ctx.authPatterns.length > 0) {
    sections.push(`## Auth Implementation (for password hashing, etc.)\n`)
    for (const auth of ctx.authPatterns.slice(0, 2)) {
      sections.push(`### ${auth.path}\n\`\`\`\n${auth.content}\n\`\`\`\n`)
    }
  }

  sections.push(`## What I Need

Generate seed data files that:

1. **Create users** matching every actor in every team file
2. **Establish relationships** between actors (friendships, org membership, etc.)
3. **Match my existing seed style** (if I have existing seeds above)
4. **Include supporting data** that tests might need (posts, products, etc.)

### Key requirements

- User credentials must match exactly: the email/password in actor files must work to log in
- Passwords must be hashed using my app's auth system
- Relationships assumed by scenes must be seeded (e.g., if a scene expects two actors to be friends, the friendship must exist)
- Each team's data is self-contained — all relationships hold within a single team

### Output format

Generate:
1. Seed data files in my project's format/style
2. A seed runner script if I don't have one
3. A list of all relationships established between actors
`)

  return sections.join('\n')
}

/**
 * Generate a combined prompt for both teams and seeds
 */
export function generateCombinedPrompt(ctx: PromptContext): string {
  const sections: string[] = []

  sections.push(`# Generate Scenetest Teams and Seed Data

I'm setting up scenetest for my project and need both actor team files and matching seed data.

## Project: ${ctx.projectName}
`)

  if (ctx.packageJson) {
    const deps = {
      ...(ctx.packageJson.dependencies as Record<string, string> | undefined),
      ...(ctx.packageJson.devDependencies as Record<string, string> | undefined),
    }
    const relevantDeps = Object.keys(deps).filter(
      (d) =>
        d.includes('prisma') ||
        d.includes('drizzle') ||
        d.includes('sequelize') ||
        d.includes('typeorm') ||
        d.includes('mongoose') ||
        d.includes('auth') ||
        d.includes('passport') ||
        d.includes('next-auth') ||
        d.includes('lucia') ||
        d.includes('clerk') ||
        d.includes('react') ||
        d.includes('vue') ||
        d.includes('svelte') ||
        d.includes('solid')
    )
    if (relevantDeps.length > 0) {
      sections.push(`**Tech stack:** ${relevantDeps.join(', ')}\n`)
    }
  }

  if (ctx.userModels.length > 0) {
    sections.push(`## User/Account Models\n`)
    for (const model of ctx.userModels) {
      sections.push(`### ${model.path}\n\`\`\`\n${model.content}\n\`\`\`\n`)
    }
  }

  if (ctx.dbSchema.length > 0) {
    sections.push(`## Database Schema\n`)
    for (const schema of ctx.dbSchema.slice(0, 3)) {
      sections.push(`### ${schema.path}\n\`\`\`\n${schema.content}\n\`\`\`\n`)
    }
  }

  if (ctx.existingSeeds.length > 0) {
    sections.push(`## Existing Seed Files (for style reference)\n`)
    for (const seed of ctx.existingSeeds.slice(0, 2)) {
      sections.push(`### ${seed.path}\n\`\`\`\n${seed.content}\n\`\`\`\n`)
    }
  }

  if (ctx.existingScenes.length > 0) {
    sections.push(`## Existing Scenes (to understand usage patterns)\n`)
    for (const scene of ctx.existingScenes.slice(0, 2)) {
      sections.push(`### ${scene.path}\n\`\`\`\n${scene.content}\n\`\`\`\n`)
    }
  }

  sections.push(`## Scenetest Project Layout

\`\`\`
your-project/
  scenetest/
    config.ts            ← project config
    actors/
      team-maria.ts      ← one team per file
      team-john.ts
    scenes/
      onboarding.spec.ts
      social/
        friend-request.spec.ts
\`\`\`

## Team File Format

Each file in \`scenetest/actors/\` exports one team:

\`\`\`typescript
// scenetest/actors/team-maria.ts
import type { TeamConfig } from '@scenetest/scenes'

export default {
  'primary-learner': {
    key: 'maria-1',
    email: 'maria@test.com',
    password: 'test123',
  },
  'existing-friend': {
    key: 'carlos-1',
    email: 'carlos@test.com',
    password: 'test123',
  },
} satisfies TeamConfig
\`\`\`

- \`key\` is the only required field (used for data-key selector matching)
- Every team must have the same role names
- Credentials must match seed data users
- Use descriptive role names: \`primary-buyer\`, not \`user\`

## What I Need

### Part 1: Actor Teams

Generate 2-3 team files for \`scenetest/actors/\`:
- Identify user types from my models/schema
- Choose descriptive, scenario-based role names
- Include credentials that match seed data

### Part 2: Seed Data

Generate seed files that:
- Create all users from the team files
- Establish relationships between actors
- Follow my existing seed patterns
- Include supporting data for tests

### Output

1. Complete team files (one per team)
2. Seed data files in my project's format
3. Explanation of each role and its purpose
4. List of relationships established in seeds
`)

  return sections.join('\n')
}

/**
 * Generate the appropriate prompt based on type
 */
export function generatePrompt(ctx: PromptContext, type: PromptType): string {
  switch (type) {
    case 'teams':
      return generateTeamsPrompt(ctx)
    case 'seeds':
      return generateSeedsPrompt(ctx)
    case 'both':
      return generateCombinedPrompt(ctx)
  }
}

/**
 * Format the prompt for CLI output with header/footer
 */
export function formatPromptOutput(prompt: string, type: PromptType): string {
  const divider = '='.repeat(60)
  const label = type === 'both' ? 'teams and seed data' : type

  return `
${divider}
  SCENETEST PROMPT GENERATOR - ${type.toUpperCase()}
${divider}

Copy the prompt below and paste it into your preferred LLM
(Claude, ChatGPT, etc.) to generate your ${label}.

${divider}

${prompt}

${divider}
  END OF PROMPT
${divider}

Tips:
- Review the prompt and add any missing context about your app
- Specify the number of teams you want (2-3 is typical)
- Mention any specific test scenarios you're planning
- After generating, audit alignment with: building-teams.md audit prompt

`
}
