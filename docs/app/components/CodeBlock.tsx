import { useRef, useState, type ReactNode } from 'react'

interface CodeBlockProps {
  language?: string
  children: ReactNode
}

export function CodeBlock({ language = 'typescript', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(codeRef.current?.textContent ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block" data-language={language}>
      <button className="copy-btn" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre>
        <code ref={codeRef} className={`hljs language-${language}`}>{children}</code>
      </pre>
    </div>
  )
}
