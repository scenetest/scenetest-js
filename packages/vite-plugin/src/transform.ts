import { parse, type ParserOptions } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'

// Handle ESM/CJS interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse

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
 * Helper to extract serverFn body code from a function node
 */
function extractServerFnBody(code: string, serverFnNode: t.Node, filename: string, line: number): string | null {
  if (t.isArrowFunctionExpression(serverFnNode) || t.isFunctionExpression(serverFnNode)) {
    const body = serverFnNode.body
    if (t.isBlockStatement(body)) {
      const bodyCode = code.slice(body.start!, body.end!)
      return bodyCode.slice(1, -1).trim() // Remove { and }
    } else {
      return `return ${code.slice(body.start!, body.end!)}`
    }
  } else {
    console.warn(`[vite-plugin-scenetest] serverFn is not a function at ${filename}:${line}`)
    return null
  }
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

  // All scenetest packages
  const SCENETEST_PACKAGES = [
    '@scenetest/checks',
    '@scenetest/checks-react',
    '@scenetest/checks-vue',
    '@scenetest/checks-solid',
    '@scenetest/checks-svelte',
  ]

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
      if (!SCENETEST_PACKAGES.includes(source)) {
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
      const serverFnArg = args[1]
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

      // Extract serverFn body code
      const serverFnBodyCode = extractServerFnBody(code, serverFnArg, filename, line)
      if (!serverFnBodyCode) {
        return
      }

      // Store extracted assertion
      extractedAssertions.push({
        id,
        title: titleValue,
        serverFnBodyCode,
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
