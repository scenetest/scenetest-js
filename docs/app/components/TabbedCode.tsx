import { useEffect, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import scenetestSpec from '../lib/hljs-scenetest'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('scenetest', scenetestSpec)

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
  const codeRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    codeRefs.current.forEach((el) => {
      if (el) {
        // Reset before re-highlighting
        el.removeAttribute('data-highlighted')
        hljs.highlightElement(el)
      }
    })
  }, [tabs])

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
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          className={`tabbed-code-panel${i === activeIndex ? ' active' : ''}`}
        >
          <div className="code-block" data-language={tab.language || 'typescript'}>
            <button
              className="copy-btn"
              onClick={handleCopy}
            >
              {copied && i === activeIndex ? 'Copied!' : 'Copy'}
            </button>
            <pre>
              <code
                ref={(el) => { codeRefs.current[i] = el }}
                className={`language-${tab.language || 'typescript'}`}
              >
                {tab.code}
              </code>
            </pre>
          </div>
        </div>
      ))}
    </div>
  )
}
