import { markdownContent } from 'virtual:markdown-content'

export function getMarkdown(path: string): string | null {
  return markdownContent[path] ?? null
}
