import { useState, type ReactNode } from 'react'

interface CodeBlockProps {
  language?: string
  source: string
  children: ReactNode
}

export function CodeBlock({ language = 'typescript', source, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(source)
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
