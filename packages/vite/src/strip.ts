import { parse, type ParserOptions } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'

// Handle ESM/CJS interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse

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

// All scenecheck packages that should be stripped
const SCENECHECK_PACKAGES = [
  '@scenecheck/checks',
  '@scenecheck/checks-react',
  '@scenecheck/checks-vue',
  '@scenecheck/checks-solid',
  '@scenecheck/checks-svelte',
]

/**
 * Check if a module source is a scenecheck package
 */
function isScenecheckPackage(source: string): boolean {
  return SCENECHECK_PACKAGES.includes(source)
}

/**
 * Strip all scenecheck imports and function calls from source code.
 *
 * This function:
 * 1. Parses the code with Babel (handles JS, TS, JSX)
 * 2. Finds and tracks all imports from scenecheck packages
 * 3. Removes those import statements
 * 4. Removes all calls to the imported functions
 *
 * @param code Source code to transform
 * @param options Transform options
 * @returns Transformed code and optional source map
 */
export function stripScenecheck(code: string, options: StripOptions = {}): StripResult | null {
  const { sourceMap = true, filename = 'unknown.js' } = options

  // Quick check - if no scenecheck import, skip parsing
  if (!code.includes('scenecheck')) {
    return null // This catches all scenecheck-* packages too
  }

  // Track imported names from scenecheck
  // Map from local name -> imported name (handles aliases)
  const scenecheckImports = new Map<string, string>()

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
    console.warn(`[vite-plugin-scenecheck] Failed to parse ${filename}:`, e)
    return null
  }

  const s = new MagicString(code)
  let hasChanges = false

  // Ranges to remove (we collect them first, then remove to avoid index shifting issues)
  const rangesToRemove: Array<{ start: number; end: number; type: string }> = []

  traverse(ast, {
    // Collect scenecheck package imports and mark for removal
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      if (!isScenecheckPackage(source)) {
        return
      }

      // Track all imported names
      for (const specifier of path.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          const local = specifier.local.name
          scenecheckImports.set(local, imported)
        } else if (t.isImportDefaultSpecifier(specifier)) {
          // import scenecheck from 'scenecheck' - unlikely but handle it
          scenecheckImports.set(specifier.local.name, 'default')
        } else if (t.isImportNamespaceSpecifier(specifier)) {
          // import * as scenecheck from 'scenecheck' - track namespace
          scenecheckImports.set(specifier.local.name, '*')
        }
      }

      // Mark entire import for removal
      const start = path.node.start!
      const end = path.node.end!
      rangesToRemove.push({ start, end, type: 'import' })
      hasChanges = true
    },

    // Remove function calls to imported scenecheck functions
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee

      let isScenecheckCall = false

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

      // Direct call: should(...), failed(...), serverCheck(...), useTestEffect(...), etc.
      if (t.isIdentifier(callee)) {
        if (scenecheckImports.has(callee.name)) {
          const imported = scenecheckImports.get(callee.name)
          if (imported && strippableFunctions.includes(imported)) {
            isScenecheckCall = true
          }
        }
      }
      // Member call: scenecheck.should(...) (namespace import)
      else if (t.isMemberExpression(callee) && t.isIdentifier(callee.object)) {
        const objectName = callee.object.name
        if (scenecheckImports.get(objectName) === '*') {
          if (t.isIdentifier(callee.property)) {
            const propName = callee.property.name
            if (strippableFunctions.includes(propName)) {
              isScenecheckCall = true
            }
          }
        }
      }

      if (!isScenecheckCall) {
        return
      }

      // Check if this call is an ExpressionStatement (standalone call)
      const parent = path.parentPath
      if (parent && t.isExpressionStatement(parent.node)) {
        // Remove the entire statement
        const start = parent.node.start!
        const end = parent.node.end!
        rangesToRemove.push({ start, end, type: 'statement' })
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
