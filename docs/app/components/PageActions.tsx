import { useEffect, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'

interface PageActionsProps {
  rawMarkdown: string
}

function buildMarkdownUrl(pathname: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const clean = pathname.replace(/\/$/, '') || '/'
  const path = clean === '/' ? '/main.md' : `${clean}.md`
  return `${origin}${path}`
}

function buildPrompt(mdUrl: string): string {
  return `Read ${mdUrl} so I can ask you questions about it.`
}

export function PageActions({ rawMarkdown }: PageActionsProps) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const mdUrl = buildMarkdownUrl(pathname)
  const prompt = buildPrompt(mdUrl)
  const encoded = encodeURIComponent(prompt)

  function handleCopy() {
    navigator.clipboard.writeText(rawMarkdown)
    setCopied(true)
    setOpen(false)
    setTimeout(() => setCopied(false), 2000)
  }

  const items: { label: string; href: string; external?: boolean }[] = [
    { label: 'View Markdown', href: mdUrl, external: true },
    { label: 'Open in ChatGPT', href: `https://chatgpt.com/?hints=search&q=${encoded}`, external: true },
    { label: 'Open in Claude', href: `https://claude.ai/new?q=${encoded}`, external: true },
    {
      label: 'Open in Cursor',
      href: `cursor://anysphere.cursor-deeplink/prompt?text=${encoded}`,
    },
    { label: 'Open in Perplexity', href: `https://www.perplexity.ai/search/new?q=${encoded}`, external: true },
  ]

  return (
    <div className="page-actions" ref={wrapRef}>
      <button className="page-actions-main" onClick={handleCopy} aria-label="Copy page as Markdown">
        {copied ? 'Copied!' : 'Copy page'}
      </button>
      <button
        className="page-actions-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="More copy options"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="page-actions-menu" role="menu">
          <button className="page-actions-item" role="menuitem" onClick={handleCopy}>
            Copy page as Markdown
          </button>
          {items.map((item) => (
            <a
              key={item.label}
              className="page-actions-item"
              role="menuitem"
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              onClick={() => setOpen(false)}
            >
              <span>{item.label}</span>
              {item.external && (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="page-actions-ext">
                  <path
                    d="M3.5 2h4.5v4.5M8 2L3 7M2 4v4h4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
