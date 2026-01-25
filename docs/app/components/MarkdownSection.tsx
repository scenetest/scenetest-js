import { useEffect, useState } from 'react'
import { marked } from 'marked'

interface MarkdownSectionProps {
  src: string
  className?: string
}

// Configure marked for syntax highlighting hooks
marked.setOptions({
  gfm: true,
  breaks: false,
})

// Custom renderer to add copy buttons to code blocks
const renderer = new marked.Renderer()

renderer.code = function (code: { text: string; lang?: string }) {
  const lang = code.lang || ''
  const text = code.text
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // Use data attribute to store the code text for copying
  // Double-encode to handle all special characters safely in HTML attributes
  const encodedText = encodeURIComponent(encodeURIComponent(text))

  return `
    <div class="code-block" data-language="${lang}">
      <button class="copy-btn" data-code="${encodedText}">
        Copy
      </button>
      <pre><code class="language-${lang}">${escaped}</code></pre>
    </div>
  `
}

marked.use({ renderer })

export function MarkdownSection({ src, className = '' }: MarkdownSectionProps) {
  const [content, setContent] = useState<string>('<p>Loading...</p>')

  useEffect(() => {
    fetch(src)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${src}: ${res.status}`)
        }
        return res.text()
      })
      .then((md) => {
        setContent(marked(md) as string)
      })
      .catch((err) => {
        console.error('Error loading markdown:', err)
        setContent(`<p class="error">Error loading content from ${src}</p>`)
      })
  }, [src])

  useEffect(() => {
    // Apply syntax highlighting after content loads
    // @ts-expect-error hljs is loaded globally
    if (content && typeof window !== 'undefined' && window.hljs) {
      // @ts-expect-error hljs is loaded globally
      window.hljs.highlightAll()
    }

    // Set up copy button handlers
    function handleCopyClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.classList.contains('copy-btn') && target.dataset.code) {
        const text = decodeURIComponent(decodeURIComponent(target.dataset.code))
        navigator.clipboard.writeText(text)
        target.textContent = 'Copied!'
        setTimeout(() => {
          target.textContent = 'Copy'
        }, 2000)
      }
    }

    document.addEventListener('click', handleCopyClick)
    return () => document.removeEventListener('click', handleCopyClick)
  }, [content])

  return (
    <div
      className={`markdown-section ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
