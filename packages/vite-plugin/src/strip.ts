import { parse, type ParserOptions } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'

// Handle ESM/CJS interop for @babel/traverse
// Cast through any because @types/babel__traverse@7.28+ types the default export as a namespace, not a function
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as (
  ast: t.Node,
  opts: _traverse.TraverseOptions
) => void

export interface StripResult {
  code: string
  map: ReturnType<MagicString['generateMap']> | null
}

export interface StripOptions {
  /** Generate source map (default: true) */
  sourceMap?: boolean
  /** File path for source map */
  filename?: string
}

// All scenetest packages that should be stripped
const SCENETEST_PACKAGES = [
  '@scenetest/checks',
  '@scenetest/checks-react',
  '@scenetest/checks-vue',
  '@scenetest/checks-solid',
  '@scenetest/checks-svelte',
]

/**
 * Check if a module source is a scenetest package
 */
function isScenetestPackage(source: string): boolean {
  return SCENETEST_PACKAGES.includes(source)
}

/**
 * Strip all scenetest imports and function calls from source code.
 *
 * This function:
 * 1. Parses the code with Babel (handles JS, TS, JSX)
 * 2. Finds and tracks all imports from scenetest packages
 * 3. Removes those import statements
 * 4. Removes all calls to the imported functions
 *
 * @param code Source code to transform
 * @param options Transform options
 * @returns Transformed code and optional source map
 */
export function stripScenetest(code: string, options: StripOptions = {}): StripResult | null {
  const { sourceMap = true, filename = 'unknown.js' } = options

  // Quick check - if no scenetest import, skip parsing
  if (!code.includes('scenetest')) {
    return null // This catches all scenetest-* packages too
  }

  // Track imported names from scenetest
  // Map from local name → imported name (handles aliases)
  const scenetestImports = new Map<string, string>()

  // Parse with Babel
  const parserOptions: ParserOptions = {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      // Support modern syntax
      'decorators',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'dynamicImport',
      'nullishCoalescingOperator',
      'optionalChaining',
    ],
  }

  let ast: t.File
  try {
    ast = parse(code, parserOptions)
  } catch (e) {
    // If parsing fails, return null (don't transform)
    console.warn(`[vite-plugin-scenetest] Failed to parse ${filename}:`, e)
    return null
  }

  const s = new MagicString(code)
  let hasChanges = false

  // Ranges to remove (we collect them first, then remove to avoid index shifting issues)
  const rangesToRemove: Array<{ start: number; end: number; type: string }> = []

  traverse(ast, {
    // Collect scenetest package imports and mark for removal
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      if (!isScenetestPackage(source)) {
        return
      }

      // Track all imported names
      for (const specifier of path.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          const local = specifier.local.name
          scenetestImports.set(local, imported)
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // import scenetest from 'scenetest' - unlikely but handle it
          scenetestImports.set(specifier.local.name, 'default')
        } else if (t.isImportNamespaceSpecifier(specifier)) {
          // import * as scenetest from 'scenetest' - track namespace
          scenetestImports.set(specifier.local.name, '*')
        }
      }

      // Mark entire import for removal
      const start = path.node.start!
      const end = path.node.end!
      rangesToRemove.push({ start, end, type: 'import' })
      hasChanges = true
    },

    // Remove function calls to imported scenetest functions
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee

      let isScenetestCall = false

      // Functions to strip (from all framework packages)
      const strippableFunctions = [
        'should',
        'failed',
        'serverCheck',
        'match',
        'useCheck',          // React
        'watchCheck',        // Vue
        'createCheck',       // Solid
        'checkEffect',       // Svelte
      ]

      // Direct call: should(...), failed(...), assert(...), useTestEffect(...), etc.
      if (t.isIdentifier(callee)) {
        if (scenetestImports.has(callee.name)) {
          const imported = scenetestImports.get(callee.name)
          if (imported && strippableFunctions.includes(imported)) {
            isScenetestCall = true
          }
        }
      }
      // Member call: scenetest.should(...) (namespace import)
      else if (t.isMemberExpression(callee) && t.isIdentifier(callee.object)) {
        const objectName = callee.object.name
        if (scenetestImports.get(objectName) === '*') {
          if (t.isIdentifier(callee.property)) {
            const propName = callee.property.name
            if (strippableFunctions.includes(propName)) {
              isScenetestCall = true
            }
          }
        }
      }

      if (!isScenetestCall) {
        return
      }

      // Check if this call is an ExpressionStatement (standalone call)
      const parent = path.parentPath
      if (parent && t.isExpressionStatement(parent.node)) {
        const start = parent.node.start!
        const end = parent.node.end!
        if (parent.inList) {
          // Statement lives in a statement list (block, program, switch case) -
          // safe to remove entirely.
          rangesToRemove.push({ start, end, type: 'statement' })
        } else {
          // Statement is the single-statement body of a control structure
          // (e.g. `if (x) should(...)` without braces). Removing it would
          // leave a dangling `if (x)`, so replace it with an empty statement.
          rangesToRemove.push({ start, end, type: 'empty-statement' })
        }
        hasChanges = true
      } else {
        // Call is in an expression context - replace with void 0
        // This is unusual for should/failed since they return void, but handle defensively
        const start = path.node.start!
        const end = path.node.end!
        rangesToRemove.push({ start, end, type: 'expression' })
        hasChanges = true
      }
    },
  })

  if (!hasChanges) {
    return null
  }

  // Sort ranges by start position (descending) to process from end to start
  // This prevents index shifting issues
  rangesToRemove.sort((a, b) => b.start - a.start)

  for (const range of rangesToRemove) {
    if (range.type === 'expression') {
      // Replace with void 0 to maintain expression validity
      s.overwrite(range.start, range.end, 'void 0')
    } else if (range.type === 'empty-statement') {
      // Replace with an empty statement so a control structure that uses this
      // as its unbraced body still has a body.
      s.overwrite(range.start, range.end, ';')
    } else {
      // For imports and statements, remove entirely
      // Also try to remove trailing newline for cleaner output
      let end = range.end
      if (code[end] === '\n') {
        end++
      } else if (code[end] === '\r' && code[end + 1] === '\n') {
        end += 2
      }
      s.remove(range.start, end)
    }
  }

  return {
    code: s.toString(),
    map: sourceMap
      ? s.generateMap({
          source: filename,
          file: filename,
          includeContent: true,
        })
      : null,
  }
}
