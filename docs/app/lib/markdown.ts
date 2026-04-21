/// <reference types="vite/client" />

// Inline every markdown file under public/ at build time so route loaders
// can return content in the SSR payload. No runtime fs needed, which is
// what Cloudflare Workers (our deploy target) requires.
const modules = import.meta.glob('../../public/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const PREFIX = '../../public'

const markdownContent: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([k, v]) => [k.slice(PREFIX.length), v]),
)

export function getMarkdown(path: string): string | null {
  return markdownContent[path] ?? null
}
