import { Component, createResource, createEffect, onMount } from 'solid-js'
import { marked } from 'marked'

interface MarkdownSectionProps {
  src: string
  class?: string
}

// Configure marked for syntax highlighting hooks
marked.setOptions({
  gfm: true,
  breaks: false,
})

// Custom renderer to add copy buttons to code blocks
const renderer = new marked.Renderer()
const originalCode = renderer.code.bind(renderer)

renderer.code = function (code: string, language: string | undefined) {
  const lang = language || ''
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return `
    <div class="code-block" data-language="${lang}">
      <div class="code-header">
        <span class="code-language">${lang}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code)}'))">
          Copy
        </button>
      </div>
      <pre><code class="language-${lang}">${escaped}</code></pre>
    </div>
  `
}

marked.use({ renderer })

export const MarkdownSection: Component<MarkdownSectionProps> = (props) => {
  const [content] = createResource(
    () => props.src,
    async (src) => {
      try {
        const res = await fetch(src)
        if (!res.ok) {
          console.error(`Failed to fetch ${src}: ${res.status}`)
          return `<p class="error">Failed to load content from ${src}</p>`
        }
        const md = await res.text()
        return marked(md)
      } catch (err) {
        console.error(`Error loading markdown:`, err)
        return `<p class="error">Error loading content</p>`
      }
    }
  )

  // Apply syntax highlighting after content loads
  createEffect(() => {
    if (content() && typeof window !== 'undefined' && (window as any).hljs) {
      ;(window as any).hljs.highlightAll()
    }
  })

  return (
    <div
      class={`markdown-section ${props.class || ''}`}
      innerHTML={content() || '<p>Loading...</p>'}
    />
  )
}
