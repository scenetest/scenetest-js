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

/**
 * Extracted assertion from a serverCheck() call
 */
export interface ExtractedAssertion {
  /** Unique identifier (filename:line:col) */
  id: string
  /** Human-readable title */
  title: string
  /** The serverFn body code (without function wrapper) */
  serverFnBodyCode: string
  /**
   * The serverFn's first two parameters, source-preserved (names and
   * destructuring patterns) so the inlined body keeps resolving the symbols
   * it references. Always exactly two slots; missing ones fall back to the
   * canonical `server` / `data` names.
   */
  params: string
  /** Source location */
  location: {
    file: string
    line: number
    column: number
  }
}

export interface TransformResult {
  /** Transformed code */
  code: string
  /** Source map */
  map: ReturnType<MagicString['generateMap']> | null
  /** Extracted assertions */
  extractedAssertions: ExtractedAssertion[]
}

export interface TransformOptions {
  /** Generate source map (default: true) */
  sourceMap?: boolean
  /** File path for source map and assertion IDs */
  filename?: string
}

/**
 * Unwrap TypeScript-only and parenthesized wrappers so the underlying
 * function expression can be found, e.g. `((s, d) => {...}) as ServerFn`.
 */
function unwrapExpression(node: t.Node): t.Node {
  let current = node
  while (
    t.isTSAsExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/**
 * Print a single parameter pattern without its TypeScript type annotation.
 * The virtual module is evaluated as plain JS, so annotations must be dropped
 * while destructuring patterns and default values are preserved.
 */
function cleanParam(code: string, node: t.Node): string {
  if (t.isAssignmentPattern(node)) {
    return `${cleanParam(code, node.left)} = ${code.slice(node.right.start!, node.right.end!)}`
  }
  const annotation = (node as t.Identifier | t.ObjectPattern | t.ArrayPattern | t.RestElement).typeAnnotation
  const end = annotation && annotation.start != null ? annotation.start : node.end!
  // Drop a trailing TS optional marker, e.g. `data?`.
  return code.slice(node.start!, end).replace(/\?\s*$/, '').trim()
}

/**
 * Extract the serverFn body and its first two parameters from a function node.
 *
 * The body is inlined verbatim into the virtual module. The parameters are
 * source-preserved (including destructuring patterns) so a serverFn written as
 * `(server, { id }) => ...` keeps working — the canonical `server` / `data`
 * names are only used as fallbacks when the author omits a parameter.
 */
function extractServerFn(
  code: string,
  serverFnNode: t.Node,
  filename: string,
  line: number
): { body: string; params: string } | null {
  if (!t.isArrowFunctionExpression(serverFnNode) && !t.isFunctionExpression(serverFnNode)) {
    console.warn(
      `[vite-plugin-scenetest] serverCheck() second argument must be an inline function at ` +
        `${filename}:${line} (got ${serverFnNode.type}). A variable reference or other expression ` +
        `cannot be statically extracted — inline the function literal.`
    )
    return null
  }

  const fnParams = serverFnNode.params
  const p0 = fnParams[0] ? cleanParam(code, fnParams[0]) : 'server'
  const p1 = fnParams[1] ? cleanParam(code, fnParams[1]) : 'data'
  const params = `${p0}, ${p1}`

  const body = serverFnNode.body
  if (t.isBlockStatement(body)) {
    return { params, body: code.slice(body.start! + 1, body.end! - 1).trim() } // Remove { and }
  }
  return { params, body: `return ${code.slice(body.start!, body.end!)}` }
}

/**
 * Transform serverCheck() calls in source code.
 *
 * For serverCheck(title, serverFn, withData?) calls:
 * 1. Extract the serverFn to be run on the server
 * 2. Replace the call with __scenetest_rpc({ id, title, withData })
 *
 * @param code Source code to transform
 * @param options Transform options
 * @returns Transformed code, source map, and extracted assertions
 */
export function transformAssertions(code: string, options: TransformOptions = {}): TransformResult | null {
  const { sourceMap = true, filename = 'unknown.js' } = options

  // Quick check - if no serverCheck call, skip
  if (!code.includes('serverCheck')) {
    return null
  }

  // All scenetest packages. '@scenetest/checks' also covers its framework
  // subpaths (./react etc.); the checks-* names are the pre-0.12 binding
  // packages, kept for apps still importing from them.
  const SCENETEST_PACKAGES = [
    '@scenetest/checks',
    '@scenetest/checks-react',
    '@scenetest/checks-vue',
    '@scenetest/checks-solid',
    '@scenetest/checks-svelte',
  ]
  const isScenetestSource = (source: string): boolean =>
    SCENETEST_PACKAGES.some((pkg) => source === pkg || source.startsWith(pkg + '/'))

  // Track imported serverCheck name
  let serverCheckLocalName: string | null = null

  // Parse with Babel
  const parserOptions: ParserOptions = {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
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
    console.warn(`[vite-plugin-scenetest] Failed to parse ${filename}:`, e)
    return null
  }

  const s = new MagicString(code)
  const extractedAssertions: ExtractedAssertion[] = []
  let needsRpcImport = false

  // First pass: find imports from scenetest packages
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      if (!isScenetestSource(source)) {
        return
      }

      for (const specifier of path.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          if (imported === 'serverCheck') {
            serverCheckLocalName = specifier.local.name
          }
        }
      }
    },
  })

  if (!serverCheckLocalName) {
    return null
  }

  // Second pass: transform serverCheck(title, serverFn, withData?) calls
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee

      // Check if this is a serverCheck() call
      if (!t.isIdentifier(callee) || callee.name !== serverCheckLocalName) {
        return
      }

      // Get the arguments: serverCheck(title, serverFn, withData?)
      const args = path.node.arguments
      if (args.length < 2) {
        console.warn(`[vite-plugin-scenetest] serverCheck() requires at least (title, serverFn) at ${filename}:${path.node.loc?.start.line}`)
        return
      }

      const titleArg = args[0]
      const serverFnArg = unwrapExpression(args[1])
      const withDataArg = args[2] // optional

      // Get the source location
      const loc = path.node.loc
      const line = loc?.start.line ?? 0
      const column = loc?.start.column ?? 0

      // Generate assertion ID
      const id = `${filename}:${line}:${column}`

      // Extract title value
      let titleValue = 'assertion'
      if (t.isStringLiteral(titleArg)) {
        titleValue = titleArg.value
      } else if (t.isTemplateLiteral(titleArg) && titleArg.quasis.length === 1) {
        titleValue = titleArg.quasis[0].value.raw
      }

      // Extract serverFn body code and parameters
      const extracted = extractServerFn(code, serverFnArg, filename, line)
      if (!extracted) {
        return
      }

      // Store extracted assertion
      extractedAssertions.push({
        id,
        title: titleValue,
        serverFnBodyCode: extracted.body,
        params: extracted.params,
        location: { file: filename, line, column },
      })

      // Build the replacement RPC call
      let rpcCall = `__scenetest_rpc({ id: ${JSON.stringify(id)}, title: ${JSON.stringify(titleValue)}`
      if (withDataArg) {
        const withDataCode = code.slice(withDataArg.start!, withDataArg.end!)
        rpcCall += `, withData: ${withDataCode}`
      }
      rpcCall += ` })`

      // Replace the assert() call with the RPC call
      s.overwrite(path.node.start!, path.node.end!, rpcCall)
      needsRpcImport = true
    },
  })

  if (!needsRpcImport) {
    return null
  }

  // Add import at the top of the file
  // Find the position after existing imports
  let importInsertPos = 0
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) {
      importInsertPos = node.end! + 1
    } else {
      break
    }
  }

  const rpcImport = `\nimport { __scenetest_rpc } from '@scenetest/checks/runtime'\n`
  s.appendLeft(importInsertPos, rpcImport)

  return {
    code: s.toString(),
    map: sourceMap
      ? s.generateMap({
          source: filename,
          file: filename,
          includeContent: true,
        })
      : null,
    extractedAssertions,
  }
}
