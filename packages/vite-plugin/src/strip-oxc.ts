import { parseSync } from 'oxc-parser'
import { walk } from 'estree-walker'
import MagicString from 'magic-string'
import type { Node } from 'estree'

// Prototype: same API as strip.ts, but parses with oxc (Rust) and walks
// with estree-walker. Lets us A/B against the @babel/* implementation
// for correctness and parse cost on real workloads.

export interface StripResult {
  code: string
  map: ReturnType<MagicString['generateMap']> | null
}

export interface StripOptions {
  sourceMap?: boolean
  filename?: string
}

const SCENETEST_PACKAGES = new Set([
  '@scenetest/checks',
  '@scenetest/checks-react',
  '@scenetest/checks-vue',
  '@scenetest/checks-solid',
  '@scenetest/checks-svelte',
])

const STRIPPABLE_FUNCTIONS = new Set([
  'should',
  'failed',
  'serverCheck',
  'match',
  'useCheck',
  'watchCheck',
  'createCheck',
  'checkEffect',
])

type WithRange = Node & { start: number; end: number }

export function stripScenetestOxc(code: string, options: StripOptions = {}): StripResult | null {
  const { sourceMap = true, filename = 'unknown.tsx' } = options

  if (!code.includes('scenetest')) {
    return null
  }

  // Always parse as tsx — same posture as the babel version, which enables
  // both the jsx and typescript plugins unconditionally.
  let parsed: ReturnType<typeof parseSync>
  try {
    parsed = parseSync(filename, code, { lang: 'tsx' })
  } catch (e) {
    console.warn(`[vite-plugin-scenetest] Failed to parse ${filename}:`, e)
    return null
  }

  if (parsed.errors.length > 0) {
    // Match babel behavior: bail out silently on unparseable input rather
    // than emitting partial transforms.
    console.warn(`[vite-plugin-scenetest] Parse errors in ${filename}:`, parsed.errors[0].message)
    return null
  }

  // local name → imported name (handles aliases and `* as ns`)
  const scenetestImports = new Map<string, string>()
  const rangesToRemove: Array<{ start: number; end: number; type: 'import' | 'statement' | 'expression' }> = []
  let hasChanges = false

  walk(parsed.program as unknown as Node, {
    enter(node, parent) {
      if (node.type === 'ImportDeclaration') {
        const source = (node as any).source.value as string
        if (!SCENETEST_PACKAGES.has(source)) return
        for (const spec of (node as any).specifiers as any[]) {
          if (spec.type === 'ImportSpecifier') {
            const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
            scenetestImports.set(spec.local.name, imported)
          } else if (spec.type === 'ImportDefaultSpecifier') {
            scenetestImports.set(spec.local.name, 'default')
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            scenetestImports.set(spec.local.name, '*')
          }
        }
        const n = node as WithRange
        rangesToRemove.push({ start: n.start, end: n.end, type: 'import' })
        hasChanges = true
        return
      }

      if (node.type === 'CallExpression') {
        const callee = (node as any).callee
        let isScenetestCall = false

        if (callee.type === 'Identifier') {
          const imported = scenetestImports.get(callee.name)
          if (imported && STRIPPABLE_FUNCTIONS.has(imported)) {
            isScenetestCall = true
          }
        } else if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
          if (scenetestImports.get(callee.object.name) === '*' && callee.property.type === 'Identifier') {
            if (STRIPPABLE_FUNCTIONS.has(callee.property.name)) {
              isScenetestCall = true
            }
          }
        }

        if (!isScenetestCall) return

        if (parent && parent.type === 'ExpressionStatement') {
          const p = parent as WithRange
          rangesToRemove.push({ start: p.start, end: p.end, type: 'statement' })
        } else {
          const n = node as WithRange
          rangesToRemove.push({ start: n.start, end: n.end, type: 'expression' })
        }
        hasChanges = true
      }
    },
  })

  if (!hasChanges) return null

  const s = new MagicString(code)
  rangesToRemove.sort((a, b) => b.start - a.start)

  for (const range of rangesToRemove) {
    if (range.type === 'expression') {
      s.overwrite(range.start, range.end, 'void 0')
    } else {
      let end = range.end
      if (code[end] === '\n') end++
      else if (code[end] === '\r' && code[end + 1] === '\n') end += 2
      s.remove(range.start, end)
    }
  }

  return {
    code: s.toString(),
    map: sourceMap ? s.generateMap({ source: filename, file: filename, includeContent: true }) : null,
  }
}
