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
  const rawLang = code.lang || ''
  const text = code.text

  // Check for tab label: ```ts [Tab Label]
  const tabMatch = rawLang.match(/^(\w*)\s*\[(.+)\]$/)
  const lang = tabMatch ? tabMatch[1] : rawLang
  const tabLabel = tabMatch ? tabMatch[2] : ''

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

  const tabAttr = tabLabel
    ? ` data-tab="${tabLabel.replace(/"/g, '&quot;')}"`
    : ''

  return `
    <div class="code-block"${tabAttr} data-language="${lang}">
      <button class="copy-btn" data-code="${encodedText}">
        Copy
      </button>
      <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
    </div>
  `
}

marked.use({ renderer })

/**
 * Post-process marked HTML to group consecutive code blocks that have
 * data-tab attributes into a single tabbed container.
 *
 * Authoring convention in markdown:
 *
 *   ```ts [classic.spec.ts]
 *   test('login', async ({ actor }) => { ... })
 *   ```
 *
 *   ```ts [concurrent.spec.ts]
 *   scene('login', async ({ actor }) => { ... })
 *   ```
 *
 *   ```ts [dsl.spec.md]
 *   ['openTo /login', 'see login-form', ...]
 *   ```
 *
 * Consecutive fenced blocks whose language includes [Label] are merged
 * into a single .tabbed-code widget.
 */
function groupTabbedBlocks(html: string): string {
  // Match a single tabbed code block.  The inner HTML never contains a
  // nested <div>, so a lazy match to the first </div> is safe.
  const blockRe =
    /<div class="code-block" data-tab="([^"]*)"[^>]*>[\s\S]*?<\/div>/g

  // Collect every tabbed block with its position in the source string.
  interface Match { full: string; tab: string; start: number; end: number }
  const matches: Match[] = []
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    matches.push({ full: m[0], tab: m[1], start: m.index, end: m.index + m[0].length })
  }

  if (matches.length === 0) return html

  // Group consecutive matches (only whitespace between them).
  const groups: Match[][] = []
  let cur: Match[] = [matches[0]]
  for (let i = 1; i < matches.length; i++) {
    const between = html.slice(cur[cur.length - 1].end, matches[i].start).trim()
    if (between === '') {
      cur.push(matches[i])
    } else {
      if (cur.length > 1) groups.push(cur)
      cur = [matches[i]]
    }
  }
  if (cur.length > 1) groups.push(cur)

  // Replace each group (iterate backwards to preserve positions).
  let result = html
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g]
    const start = group[0].start
    const end = group[group.length - 1].end

    const tabs = group
      .map(
        (b, i) =>
          `<button class="tabbed-code-tab${i === 0 ? ' active' : ''}" data-tab-index="${i}">${b.tab}</button>`,
      )
      .join('')

    const panels = group
      .map(
        (b, i) =>
          `<div class="tabbed-code-panel${i === 0 ? ' active' : ''}">${b.full}</div>`,
      )
      .join('')

    const widget = `<div class="tabbed-code"><div class="tabbed-code-tabs">${tabs}</div>${panels}</div>`
    result = result.slice(0, start) + widget + result.slice(end)
  }

  return result
}

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
        setContent(groupTabbedBlocks(marked(md) as string))
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

  // Tab switching for tabbed code blocks
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleTabClick(e: MouseEvent) {
      const tab = (e.target as HTMLElement).closest('.tabbed-code-tab') as HTMLElement | null
      if (!tab) return
      const tabbed = tab.closest('.tabbed-code')
      if (!tabbed) return

      const index = tab.dataset.tabIndex
      if (index == null) return

      // Update active tab
      tabbed.querySelectorAll('.tabbed-code-tab').forEach((t, i) => {
        t.classList.toggle('active', i === Number(index))
      })

      // Update active panel
      tabbed.querySelectorAll('.tabbed-code-panel').forEach((p, i) => {
        p.classList.toggle('active', i === Number(index))
      })
    }

    container.addEventListener('click', handleTabClick)
    return () => container.removeEventListener('click', handleTabClick)
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
