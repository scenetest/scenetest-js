import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Plugin } from 'vite'

const SECTIONS = [
  { dir: 'guides', label: 'Guides' },
  { dir: 'reference', label: 'Reference' },
  { dir: 'faq', label: 'FAQ' },
] as const

const PUBLIC_DIR = 'public'

/** Production site URL — the canonical home for Scenetest docs. */
const SITE = 'https://scenetest.msnook.xyz'

/** Read the first `# Heading` from a markdown file. */
function getTitle(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].replace(/`/g, '') : ''
}

/** Read the first non-heading, non-empty paragraph as a description. */
function getDescription(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('```')) continue
    // Return first real paragraph line, truncated
    return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed
  }
  return ''
}

interface PageInfo {
  title: string
  description: string
  mdPath: string
  section: string
}

function collectPages(baseDir: string): PageInfo[] {
  const pages: PageInfo[] = []
  for (const { dir } of SECTIONS) {
    const sectionDir = join(baseDir, dir)
    if (!existsSync(sectionDir)) continue
    const files = readdirSync(sectionDir).filter((f) => f.endsWith('.md')).sort()
    for (const file of files) {
      const filePath = join(sectionDir, file)
      pages.push({
        title: getTitle(filePath),
        description: getDescription(filePath),
        mdPath: `/${dir}/${file}`,
        section: dir,
      })
    }
  }
  return pages
}

function buildLlmsTxt(baseDir: string): string {
  const pages = collectPages(baseDir)
  const lines: string[] = [
    '# Scenetest',
    '',
    '> Scenetest is a scene-driven, concurrent-actor end-to-end testing framework for JavaScript apps. It splits E2E testing into simple markdown specs that drive actors through your app, and inline checks (should/failed/serverCheck) that validate your mental model from inside your components, effects, and callbacks. A Vite plugin strips all test code from production builds.',
    '',
    '## Docs',
    '',
  ]

  let currentSection = ''
  for (const page of pages) {
    if (page.section !== currentSection) {
      currentSection = page.section
      const label = SECTIONS.find((s) => s.dir === currentSection)!.label
      if (lines[lines.length - 1] !== '') lines.push('')
      lines.push(`### ${label}`)
      lines.push('')
    }
    lines.push(`- [${page.title}](${SITE}${page.mdPath}): ${page.description}`)
  }

  lines.push('')
  return lines.join('\n')
}

function buildLlmsFullTxt(baseDir: string): string {
  const pages = collectPages(baseDir)
  const parts: string[] = [
    '# Scenetest',
    '',
    '> Scenetest is a scene-driven, concurrent-actor end-to-end testing framework for JavaScript apps. It splits E2E testing into simple markdown specs that drive actors through your app, and inline checks (should/failed/serverCheck) that validate your mental model from inside your components, effects, and callbacks. A Vite plugin strips all test code from production builds.',
    '',
  ]

  // Include home page
  const mainMd = join(baseDir, 'main.md')
  if (existsSync(mainMd)) {
    parts.push(readFileSync(mainMd, 'utf-8').trim())
    parts.push('')
    parts.push('---')
    parts.push('')
  }

  for (const page of pages) {
    const filePath = join(baseDir, page.mdPath.slice(1))
    if (existsSync(filePath)) {
      parts.push(readFileSync(filePath, 'utf-8').trim())
      parts.push('')
      parts.push('---')
      parts.push('')
    }
  }

  return parts.join('\n')
}

export function llmsTxt(): Plugin {
  let llmsTxtContent: string
  let llmsFullTxtContent: string

  return {
    name: 'llms-txt',

    configureServer(server) {
      const base = join(process.cwd(), PUBLIC_DIR)

      server.middlewares.use((req, res, next) => {
        if (req.url === '/llms.txt') {
          llmsTxtContent ??= buildLlmsTxt(base)
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(llmsTxtContent)
          return
        }
        if (req.url === '/llms-full.txt') {
          llmsFullTxtContent ??= buildLlmsFullTxt(base)
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(llmsFullTxtContent)
          return
        }
        next()
      })
    },

    // Emit during the client build so the files land in whatever static output
    // directory the active Nitro preset uses (e.g. .vercel/output/static for
    // the vercel preset, .output/public for node-server). Writing to a fixed
    // path breaks in production because the preset's static dir differs.
    generateBundle() {
      if (this.environment?.name !== 'client') return

      const base = join(process.cwd(), PUBLIC_DIR)
      llmsTxtContent ??= buildLlmsTxt(base)
      llmsFullTxtContent ??= buildLlmsFullTxt(base)

      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsTxtContent })
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: llmsFullTxtContent })
    },
  }
}
