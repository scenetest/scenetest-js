import { Children, createElement, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import Markdown, { type Options } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { TabbedCode } from './TabbedCode'
import { highlightLanguages, rehypeStashCodeSource } from '../lib/highlight'
import 'highlight.js/styles/github.css'

interface MarkdownSectionProps {
  /** Markdown source, loaded server-side so it renders into the SSR HTML. */
  content: string | null
  className?: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
}

/** Extract plain text from React children (for heading ID generation). */
function textContent(children: ReactNode): string {
  const parts: string[] = []
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      parts.push(String(child))
    } else if (child && typeof child === 'object' && 'props' in child) {
      const props = child.props as { children?: ReactNode }
      parts.push(textContent(props.children))
    }
  })
  return parts.join('')
}

// -- Segment types for pre-processing markdown --------------------------

interface MarkdownSegment {
  type: 'markdown'
  content: string
}

interface TabbedSegment {
  type: 'tabs'
  tabs: { label: string; language: string; code: string }[]
}

type Segment = MarkdownSegment | TabbedSegment

/**
 * Split raw markdown into segments, grouping consecutive fenced code blocks
 * that carry a `[Tab Label]` annotation into TabbedSegment entries.
 *
 * A tab-annotated block looks like:
 *
 *   ```ts [classic.spec.ts]
 *   code here
 *   ```
 *
 * Two or more consecutive such blocks become a single TabbedSegment.
 * A lone annotated block is kept as regular markdown (label stripped).
 */
function splitMarkdownSegments(md: string): Segment[] {
  // Match fenced code blocks: ```lang [label]\n...\n```
  const fenceRe = /^(`{3,})(\w*)\s*\[([^\]]+)\]\s*\n([\s\S]*?)^\1\s*$/gm

  interface FencedBlock {
    label: string
    language: string
    code: string
    start: number
    end: number
  }

  const blocks: FencedBlock[] = []
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(md)) !== null) {
    blocks.push({
      label: m[3],
      language: m[2] || 'typescript',
      code: m[4].replace(/\n$/, ''),
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  if (blocks.length === 0) {
    return [{ type: 'markdown', content: md }]
  }

  // Group consecutive blocks (only whitespace between them)
  const groups: FencedBlock[][] = []
  let cur: FencedBlock[] = [blocks[0]]
  for (let i = 1; i < blocks.length; i++) {
    const between = md.slice(cur[cur.length - 1].end, blocks[i].start).trim()
    if (between === '') {
      cur.push(blocks[i])
    } else {
      groups.push(cur)
      cur = [blocks[i]]
    }
  }
  groups.push(cur)

  // Build segments
  const segments: Segment[] = []
  let pos = 0

  for (const group of groups) {
    const groupStart = group[0].start
    const groupEnd = group[group.length - 1].end

    // Markdown before this group
    if (pos < groupStart) {
      const before = md.slice(pos, groupStart).trim()
      if (before) segments.push({ type: 'markdown', content: before })
    }

    if (group.length >= 2) {
      // Real tabbed group
      segments.push({
        type: 'tabs',
        tabs: group.map((b) => ({
          label: b.label,
          language: b.language,
          code: b.code,
        })),
      })
    } else {
      // Single annotated block — render as plain code block (strip the label)
      const b = group[0]
      const plain = '```' + b.language + '\n' + b.code + '\n```'
      segments.push({ type: 'markdown', content: plain })
    }

    pos = groupEnd
  }

  // Trailing markdown
  if (pos < md.length) {
    const after = md.slice(pos).trim()
    if (after) segments.push({ type: 'markdown', content: after })
  }

  return segments
}

// -- Scroll helper -------------------------------------------------------

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, '')
  if (!id) return
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'instant' })
  }
}

// -- Heading component factory -------------------------------------------

function makeHeading(level: number) {
  const tag = `h${level}`
  return function HeadingComponent({ children }: { children?: ReactNode }) {
    const id = slugify(textContent(children))
    return createElement(tag, { id }, children)
  }
}

// -- rehype plugins -------------------------------------------------------

const rehypePlugins: Options['rehypePlugins'] = [
  rehypeRaw,
  rehypeStashCodeSource,
  [rehypeHighlight, { languages: highlightLanguages, detect: false, plainText: ['text'] }],
]
const remarkPlugins: Options['remarkPlugins'] = [remarkGfm]

// -- Main component -------------------------------------------------------

export function MarkdownSection({ content, className = '' }: MarkdownSectionProps) {
  const rawMarkdown = content
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()
  const router = useRouter()

  // Scroll to hash target after content renders or hash changes.
  // Delay slightly so the view transition animation doesn't reset scroll.
  useEffect(() => {
    if (!hash || rawMarkdown === null) return
    const timeout = setTimeout(() => scrollToHash(hash), 320)
    return () => clearTimeout(timeout)
  }, [hash, rawMarkdown])

  // Split into segments
  const segments = useMemo(
    () => (rawMarkdown ? splitMarkdownSegments(rawMarkdown) : []),
    [rawMarkdown],
  )

  // Custom components for react-markdown
  const components = useMemo(
    () => ({
      a({ href, children }: { href?: string; children?: ReactNode }) {
        if (href?.startsWith('/')) {
          return <Link to={href}>{children}</Link>
        }
        if (href?.startsWith('#')) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                scrollToHash(href)
                history.replaceState(null, '', href)
              }}
            >
              {children}
            </a>
          )
        }
        return <a href={href}>{children}</a>
      },
      h1: makeHeading(1),
      h2: makeHeading(2),
      h3: makeHeading(3),
      h4: makeHeading(4),
      h5: makeHeading(5),
      h6: makeHeading(6),
      code({
        className: codeClassName,
        children,
        node,
      }: {
        className?: string
        children?: ReactNode
        node?: { data?: { codeSource?: string } }
      }) {
        // Inline code — no language class set by react-markdown
        if (!codeClassName?.includes('language-')) return <code>{children}</code>
        // Fenced block — rehype-highlight has already wrapped the source in
        // hljs-* spans; CodeBlock just adds chrome (pre, copy button).
        const lang = codeClassName.match(/language-(\S+)/)?.[1] ?? 'text'
        const source = node?.data?.codeSource ?? ''
        return (
          <CodeBlock language={lang} source={source}>
            {children}
          </CodeBlock>
        )
      },
      // CodeBlock already wraps in <pre>, so unwrap the default <pre>
      pre({ children }: { children?: ReactNode }) {
        return <>{children}</>
      },
    }),
    [router],
  )

  function handleCopyMarkdown() {
    if (!rawMarkdown) return
    navigator.clipboard.writeText(rawMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`markdown-section ${className}`} ref={containerRef}>
      {rawMarkdown && (
        <button className="copy-md-btn" onClick={handleCopyMarkdown}>
          {copied ? 'Copied!' : 'Copy markdown'}
        </button>
      )}
      {segments.map((seg, i) =>
        seg.type === 'tabs' ? (
          <TabbedCode key={i} tabs={seg.tabs} />
        ) : (
          <Markdown
            key={i}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {seg.content}
          </Markdown>
        ),
      )}
    </div>
  )
}
