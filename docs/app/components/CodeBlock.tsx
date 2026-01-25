import { useRef, useState } from 'react'

interface CodeBlockProps {
  language?: string
  children: string
}

export function CodeBlock({ language = 'typescript', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block" data-language={language}>
      <button className="copy-btn" onClick={handleCopy} style={{ opacity: 1 }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre>
        <code ref={codeRef} className={`language-${language}`}>
          {children}
        </code>
      </pre>
    </div>
  )
}
