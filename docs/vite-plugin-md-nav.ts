import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import type { Plugin } from 'vite'

const SECTIONS = ['guides', 'reference', 'faq'] as const
const PUBLIC_DIR = 'public'
const OUTPUT_DIR = '.output/public'

/** Read the first `# Heading` from a markdown file for use as the link title. */
function getTitle(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].replace(/`/g, '') : basename(filePath, '.md')
}

/** Scan public/ and build a sitemap footer from the directory structure. */
function buildNav(baseDir: string): string {
  const lines: string[] = ['\n---\n', '## Pages on this site\n', '- [Home](/)\n']

  for (const section of SECTIONS) {
    const dir = join(baseDir, section)
    if (!existsSync(dir)) continue

    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()

    const label = section === 'faq' ? 'FAQ' : section.charAt(0).toUpperCase() + section.slice(1)
    lines.push(`**${label}**\n`)
    for (const file of files) {
      const title = getTitle(join(dir, file))
      lines.push(`- [${title}](/${section}/${file})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function markdownNav(): Plugin {
  let nav: string

  return {
    name: 'markdown-nav',

    configureServer(server) {
      const base = join(process.cwd(), PUBLIC_DIR)
      nav ??= buildNav(base)

      // Register before Vite's static middleware so we intercept .md requests
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.endsWith('.md') || req.headers['x-raw']) return next()

        const filePath = join(base, req.url)
        if (!existsSync(filePath)) return next()

        try {
          const content = readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
          res.end(content + nav)
        } catch {
          next()
        }
      })
    },

    closeBundle() {
      // After build, append nav to .md files in the Nitro output directory
      const outDir = join(process.cwd(), OUTPUT_DIR)
      if (!existsSync(outDir)) return

      const base = join(process.cwd(), PUBLIC_DIR)
      nav ??= buildNav(base)

      function walk(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(full)
          } else if (entry.name.endsWith('.md')) {
            const content = readFileSync(full, 'utf-8')
            writeFileSync(full, content + nav)
          }
        }
      }

      walk(outDir)
    },
  }
}
