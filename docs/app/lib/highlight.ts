import { createElement, type ReactNode } from 'react'
import { createLowlight, common } from 'lowlight'
import type { LanguageFn } from 'lowlight'
import type { Element, Root, RootContent } from 'hast'
import scenetestSpec from './hljs-scenetest'

declare module 'hast' {
  interface ElementData {
    codeSource?: string
  }
}

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

/** rehype plugin: stash raw source text of fenced code blocks on the
 * `<code>` element's `data` slot (hast-internal, not serialized to HTML),
 * so the copy button can emit the original source instead of
 * reconstructing it from the highlighted React tree. Must run before
 * rehype-highlight, which replaces the text children with hljs spans. */
export function rehypeStashCodeSource() {
  return (tree: Root) => {
    walk(tree)
  }
  function walk(node: Root | Element) {
    if (node.type === 'element' && node.tagName === 'code' && hasLangClass(node)) {
      const raw = node.children
        .map((c) => (c.type === 'text' ? c.value : ''))
        .join('')
      node.data = { ...node.data, codeSource: raw }
    }
    for (const child of node.children) {
      if (child.type === 'element') walk(child)
    }
  }
  function hasLangClass(node: Element): boolean {
    const cls = node.properties?.className
    if (!Array.isArray(cls)) return false
    return cls.some((c) => typeof c === 'string' && c.startsWith('language-'))
  }
}
