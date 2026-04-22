import { createElement, type ReactNode } from 'react'
import { createLowlight, common } from 'lowlight'
import type { LanguageFn } from 'lowlight'
import type { Root, RootContent } from 'hast'
import scenetestSpec from './hljs-scenetest'

const lowlight = createLowlight(common)
lowlight.register('scenetest', scenetestSpec as LanguageFn)

/** Languages registered with highlight.js — exposed so react-markdown's
 * rehype-highlight plugin can load the same set. */
export const highlightLanguages: Record<string, LanguageFn> = {
  ...common,
  scenetest: scenetestSpec as LanguageFn,
}

function hastToReact(node: Root | RootContent, key: number): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type === 'element') {
    const { className, ...rest } = (node.properties ?? {}) as Record<string, unknown>
    const props: Record<string, unknown> = { key, ...rest }
    if (Array.isArray(className)) props.className = className.join(' ')
    else if (typeof className === 'string') props.className = className
    return createElement(
      node.tagName,
      props,
      ...node.children.map((c, i) => hastToReact(c, i)),
    )
  }
  if (node.type === 'root') {
    return node.children.map((c, i) => hastToReact(c, i))
  }
  return null
}

/** Highlight `code` as React nodes (hljs-prefixed spans). Used for tabbed
 * code blocks, which don't go through the react-markdown pipeline. */
export function highlightCode(language: string, code: string): ReactNode {
  if (!lowlight.listLanguages().includes(language)) return code
  const tree = lowlight.highlight(language, code)
  return hastToReact(tree, 0)
}
