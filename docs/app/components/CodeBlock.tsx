import { Children, useState, type ReactNode } from 'react'

interface CodeBlockProps {
  language?: string
  children: ReactNode
}

function extractText(children: ReactNode): string {
  let out = ''
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      out += child
    } else if (child && typeof child === 'object' && 'props' in child) {
      out += extractText((child.props as { children?: ReactNode }).children)
    }
  })
  return out
}

export function CodeBlock({ language = 'typescript', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(extractText(children))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block" data-language={language}>
      <button className="copy-btn" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre>
        <code className={`hljs language-${language}`}>{children}</code>
      </pre>
    </div>
  )
}
