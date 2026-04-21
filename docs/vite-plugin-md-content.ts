import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Plugin } from 'vite'

const PUBLIC_DIR = 'public'
const VIRTUAL_ID = 'virtual:markdown-content'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Inlines every `.md` file under `public/` into a virtual module
 * (`virtual:markdown-content`) so route loaders can return markdown content
 * in the SSR payload without filesystem access at runtime (e.g. Cloudflare
 * Workers). The exported `markdownContent` is a `Record<path, content>`
 * keyed by the site-relative path (e.g. `/guides/getting-started.md`).
 */
function collectMarkdown(baseDir: string): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(dir: string, prefix: string) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, prefix + '/' + entry.name)
      } else if (entry.name.endsWith('.md')) {
        out[prefix + '/' + entry.name] = readFileSync(full, 'utf-8')
      }
    }
  }
  walk(baseDir, '')
  return out
}

export function markdownContent(): Plugin {
  const base = join(process.cwd(), PUBLIC_DIR)
  let cached: Record<string, string> | null = null

  return {
    name: 'markdown-content',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id !== RESOLVED_ID) return
      cached ??= collectMarkdown(base)
      return `export const markdownContent = ${JSON.stringify(cached)};\n`
    },

    handleHotUpdate(ctx) {
      if (!ctx.file.endsWith('.md')) return
      if (!ctx.file.startsWith(base)) return
      cached = null
      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_ID)
      if (mod) return [mod]
    },
  }
}
