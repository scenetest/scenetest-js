import { useEffect, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)

interface MarkdownSectionProps {
  src: string
  className?: string
}

// Configure marked for syntax highlighting hooks
marked.setOptions({
  gfm: true,
  breaks: false,
})

// Custom renderer for headings with id anchors, and code blocks with copy buttons
const renderer = new marked.Renderer()

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
}

renderer.heading = function ({ text, depth }: { text: string; depth: number }) {
  const id = slugify(text)
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}

renderer.code = function (code: { text: string; lang?: string }) {
  const lang = code.lang || ''
  const text = code.text

  // Highlight at parse time so the HTML already has hljs classes baked in.
  // No post-render DOM walk needed.
  let highlighted: string
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value
  } else {
    highlighted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // Use data attribute to store the code text for copying
  // Double-encode to handle all special characters safely in HTML attributes
  const encodedText = encodeURIComponent(encodeURIComponent(text))

  return `
    <div class="code-block" data-language="${lang}">
      <button class="copy-btn" data-code="${encodedText}">
        Copy
      </button>
      <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
    </div>
  `
}

marked.use({ renderer })

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, '')
  if (!id) return
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'instant' })
  }
}

export function MarkdownSection({ src, className = '' }: MarkdownSectionProps) {
  const [content, setContent] = useState<string>('<p>Loading...</p>')
  const [rawMarkdown, setRawMarkdown] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()

  useEffect(() => {
    fetch(src)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch ${src}: ${res.status}`)
        }
        return res.text()
      })
      .then((md) => {
        setRawMarkdown(md)
        setContent(marked(md) as string)
      })
      .catch((err) => {
        console.error('Error loading markdown:', err)
        setContent(`<p class="error">Error loading content from ${src}</p>`)
      })
  }, [src])

  function handleCopyMarkdown() {
    if (!rawMarkdown) return
    navigator.clipboard.writeText(rawMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Scroll to hash target after content renders or hash changes.
  // Delay slightly so the view transition animation doesn't reset scroll.
  useEffect(() => {
    if (!hash || content === '<p>Loading...</p>') return
    const timeout = setTimeout(() => scrollToHash(hash), 320)
    return () => clearTimeout(timeout)
  }, [hash, content])

  // Intercept hash-only link clicks inside rendered markdown so they
  // scroll directly instead of triggering a router navigation + view transition.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleClick(e: MouseEvent) {
      const link = (e.target as HTMLElement).closest('a')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || !href.startsWith('#')) return
      e.preventDefault()
      e.stopPropagation()
      scrollToHash(href)
      history.replaceState(null, '', href)
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [content])

  // Copy button handlers
  useEffect(() => {
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
    <div className={`markdown-section ${className}`}>
      {rawMarkdown && (
        <button className="copy-md-btn" onClick={handleCopyMarkdown}>
          {copied ? 'Copied!' : 'Copy markdown'}
        </button>
      )}
      <div
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}
