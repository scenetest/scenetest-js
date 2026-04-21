import { useState } from 'react'
import { highlightCode } from '../lib/highlight'

interface Tab {
  label: string
  language?: string
  code: string
}

interface TabbedCodeProps {
  tabs: Tab[]
}

export function TabbedCode({ tabs }: TabbedCodeProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(tabs[activeIndex].code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="tabbed-code">
      <div className="tabbed-code-tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            className={`tabbed-code-tab${i === activeIndex ? ' active' : ''}`}
            onClick={() => { setActiveIndex(i); setCopied(false) }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => {
        const language = tab.language || 'typescript'
        return (
          <div
            key={tab.label}
            className={`tabbed-code-panel${i === activeIndex ? ' active' : ''}`}
          >
            <div className="code-block" data-language={language}>
              <button className="copy-btn" onClick={handleCopy}>
                {copied && i === activeIndex ? 'Copied!' : 'Copy'}
              </button>
              <pre>
                <code className={`hljs language-${language}`}>
                  {highlightCode(language, tab.code)}
                </code>
              </pre>
            </div>
          </div>
        )
      })}
    </div>
  )
}
