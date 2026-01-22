import { parse, type ParserOptions } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'

// Handle ESM/CJS interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse

/**
 * Extracted assertion from an assert() or useAssert() call
 */
export interface ExtractedAssertion {
  /** Unique identifier (filename:line:col:key?) */
  id: string
  /** Human-readable title from the config */
  title: string
  /** Optional key for disambiguation */
  key?: string
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
 * Helper to extract properties from a config object.
 */
function extractConfigProps(configObj: t.ObjectExpression): {
  titleNode: t.Node | null
  keyNode: t.Node | null
  withDataNode: t.Node | null
  serverFnNode: t.Node | null
  serverFnProp: t.ObjectProperty | null
} {
  let titleNode: t.Node | null = null
  let keyNode: t.Node | null = null
  let withDataNode: t.Node | null = null
  let serverFnNode: t.Node | null = null
  let serverFnProp: t.ObjectProperty | null = null

  for (const prop of configObj.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
      continue
    }

    const keyName = prop.key.name
    if (keyName === 'title') {
      titleNode = prop.value
    } else if (keyName === 'key') {
      keyNode = prop.value
    } else if (keyName === 'withData') {
      withDataNode = prop.value
    } else if (keyName === 'serverFn') {
      serverFnNode = prop.value
      serverFnProp = prop
    }
  }

  return { titleNode, keyNode, withDataNode, serverFnNode, serverFnProp }
}

/**
 * Transform assert() and useAssert() calls in source code.
 *
 * For assert() calls:
 * 1. Extract the serverFn to be run on the server
 * 2. Replace the call with __scenetest_rpc({ id, title, key?, withData })
 *
 * For useAssert() calls:
 * 1. Extract the serverFn from the config object
 * 2. Replace serverFn property with __assertionId
 * 3. Replace useAssert with __useAssert
 *
 * @param code Source code to transform
 * @param options Transform options
 * @returns Transformed code, source map, and extracted assertions
 */
export function transformAssertions(code: string, options: TransformOptions = {}): TransformResult | null {
  const { sourceMap = true, filename = 'unknown.js' } = options

  // Quick check - if no assert call, skip
  if (!code.includes('assert')) {
    return null
  }

  // All scenetest packages
  const SCENETEST_PACKAGES = [
    'scenetest',
    'scenetest-react',
    'scenetest-vue',
    'scenetest-solid',
    'scenetest-svelte',
  ]

  // Track imported names and their source packages
  let assertLocalName: string | null = null
  let useAssertLocalName: string | null = null
  let useAssertSourcePackage: string | null = null
  let createAssertLocalName: string | null = null
  let runAssertLocalName: string | null = null

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
  let needsUseAssertImport = false
  let needsCreateAssertImport = false
  let needsRunAssertImport = false

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
          if (imported === 'assert') {
            assertLocalName = specifier.local.name
          } else if (imported === 'useAssert') {
            useAssertLocalName = specifier.local.name
            useAssertSourcePackage = source
          } else if (imported === 'createAssert') {
            createAssertLocalName = specifier.local.name
          } else if (imported === 'runAssert') {
            runAssertLocalName = specifier.local.name
          }
        }
      }
    },
  })

  if (!assertLocalName && !useAssertLocalName && !createAssertLocalName && !runAssertLocalName) {
    return null
  }

  // Second pass: transform assert() calls
  if (assertLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        // Check if this is an assert() call
        if (!t.isIdentifier(callee) || callee.name !== assertLocalName) {
          return
        }

        // Get the config object argument
        const args = path.node.arguments
        if (args.length !== 1 || !t.isObjectExpression(args[0])) {
          console.warn(`[vite-plugin-scenetest] assert() requires a single config object at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const configObj = args[0]
        const { titleNode, keyNode, withDataNode, serverFnNode } = extractConfigProps(configObj)

        if (!titleNode || !serverFnNode) {
          console.warn(`[vite-plugin-scenetest] assert() missing required properties at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        // Get the source location
        const loc = path.node.loc
        const line = loc?.start.line ?? 0
        const column = loc?.start.column ?? 0

        // Extract key value if present
        let keyValue: string | undefined
        if (keyNode && t.isStringLiteral(keyNode)) {
          keyValue = keyNode.value
        }

        // Generate assertion ID
        const id = keyValue
          ? `${filename}:${line}:${column}:${keyValue}`
          : `${filename}:${line}:${column}`

        // Extract title value
        let titleValue = 'assertion'
        if (t.isStringLiteral(titleNode)) {
          titleValue = titleNode.value
        }

        // Extract serverFn body code
        const serverFnBodyCode = extractServerFnBody(code, serverFnNode, filename, line)
        if (!serverFnBodyCode) {
          return
        }

        // Store extracted assertion
        extractedAssertions.push({
          id,
          title: titleValue,
          key: keyValue,
          serverFnBodyCode,
          location: { file: filename, line, column },
        })

        // Build the replacement RPC call
        let rpcCall = `__scenetest_rpc({ id: ${JSON.stringify(id)}, title: ${JSON.stringify(titleValue)}`
        if (keyValue) {
          rpcCall += `, key: ${JSON.stringify(keyValue)}`
        }
        if (withDataNode) {
          const withDataCode = code.slice(withDataNode.start!, withDataNode.end!)
          rpcCall += `, withData: ${withDataCode}`
        }
        rpcCall += ` })`

        // Replace the assert() call with the RPC call
        s.overwrite(path.node.start!, path.node.end!, rpcCall)
        needsRpcImport = true
      },
    })
  }

  // Third pass: transform useAssert() calls
  // useAssert(config | undefined, deps) where config has { title, withData?, serverFn }
  if (useAssertLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        // Check if this is a useAssert() call
        if (!t.isIdentifier(callee) || callee.name !== useAssertLocalName) {
          return
        }

        const args = path.node.arguments
        if (args.length < 2) {
          console.warn(`[vite-plugin-scenetest] useAssert() requires (config, deps) at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const configArg = args[0]
        const depsArg = args[1]
        const depsCode = code.slice(depsArg.start!, depsArg.end!)

        // Get location for ID generation
        const loc = path.node.loc
        const line = loc?.start.line ?? 0
        const column = loc?.start.column ?? 0

        // Helper to process a config object and register the assertion
        const processConfigObject = (configObj: t.ObjectExpression): {
          id: string
          titleValue: string
          keyValue?: string
        } | null => {
          const { titleNode, keyNode, withDataNode, serverFnNode, serverFnProp } = extractConfigProps(configObj)

          if (!titleNode || !serverFnNode || !serverFnProp) {
            console.warn(`[vite-plugin-scenetest] useAssert() config missing required properties at ${filename}:${line}`)
            return null
          }

          // Extract key value if present
          let keyValue: string | undefined
          if (keyNode && t.isStringLiteral(keyNode)) {
            keyValue = keyNode.value
          }

          // Generate assertion ID
          const id = keyValue
            ? `${filename}:${line}:${column}:${keyValue}`
            : `${filename}:${line}:${column}`

          // Extract title value
          let titleValue = 'assertion'
          if (t.isStringLiteral(titleNode)) {
            titleValue = titleNode.value
          }

          // Extract serverFn body code
          const serverFnBodyCode = extractServerFnBody(code, serverFnNode, filename, line)
          if (!serverFnBodyCode) {
            return null
          }

          // Store extracted assertion
          extractedAssertions.push({
            id,
            title: titleValue,
            key: keyValue,
            serverFnBodyCode,
            location: { file: filename, line, column },
          })

          // Replace serverFn property with __assertionId in the source
          s.overwrite(serverFnProp.start!, serverFnProp.end!, `__assertionId: ${JSON.stringify(id)}`)

          return { id, titleValue, keyValue }
        }

        // Handle different forms of the config argument:
        // 1. Direct object: useAssert({ title, withData?, serverFn }, deps)
        // 2. Conditional: useAssert(condition ? undefined : { ... }, deps)
        // 3. Conditional: useAssert(condition ? { ... } : undefined, deps)

        if (t.isObjectExpression(configArg)) {
          // Direct object
          const result = processConfigObject(configArg)
          if (!result) return

          // Replace useAssert with __useAssert
          s.overwrite(callee.start!, callee.end!, '__useAssert')
          needsUseAssertImport = true

        } else if (t.isConditionalExpression(configArg)) {
          // Conditional expression - find the object in consequent or alternate
          const { consequent, alternate } = configArg

          let configObj: t.ObjectExpression | null = null
          if (t.isObjectExpression(consequent)) {
            configObj = consequent
          } else if (t.isObjectExpression(alternate)) {
            configObj = alternate
          }

          if (!configObj) {
            // Both branches are non-objects (e.g., both could be identifiers)
            // We can't statically analyze this, skip
            console.warn(`[vite-plugin-scenetest] useAssert() conditional must have an object literal in one branch at ${filename}:${line}`)
            return
          }

          const result = processConfigObject(configObj)
          if (!result) return

          // Replace useAssert with __useAssert
          s.overwrite(callee.start!, callee.end!, '__useAssert')
          needsUseAssertImport = true

        } else if (t.isIdentifier(configArg) && configArg.name === 'undefined') {
          // Just undefined - nothing to transform, but still rename the call
          s.overwrite(callee.start!, callee.end!, '__useAssert')
          needsUseAssertImport = true
        } else {
          // Could be a variable reference or other expression
          // We can't statically extract the serverFn, skip with warning
          console.warn(`[vite-plugin-scenetest] useAssert() config must be an object literal or conditional at ${filename}:${line}`)
          return
        }
      },
    })
  }

  // Fourth pass: transform createAssert() calls (Solid)
  if (createAssertLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        if (!t.isIdentifier(callee) || callee.name !== createAssertLocalName) {
          return
        }

        const args = path.node.arguments
        if (args.length < 2) {
          console.warn(`[vite-plugin-scenetest] createAssert() requires (config, deps) at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const configArg = args[0]
        const loc = path.node.loc
        const line = loc?.start.line ?? 0
        const column = loc?.start.column ?? 0

        if (t.isObjectExpression(configArg)) {
          const { titleNode, keyNode, withDataNode, serverFnNode, serverFnProp } = extractConfigProps(configArg)

          if (!titleNode || !withDataNode || !serverFnNode || !serverFnProp) {
            console.warn(`[vite-plugin-scenetest] createAssert() config missing required properties at ${filename}:${line}`)
            return
          }

          let keyValue: string | undefined
          if (keyNode && t.isStringLiteral(keyNode)) {
            keyValue = keyNode.value
          }

          const id = keyValue
            ? `${filename}:${line}:${column}:${keyValue}`
            : `${filename}:${line}:${column}`

          let titleValue = 'assertion'
          if (t.isStringLiteral(titleNode)) {
            titleValue = titleNode.value
          }

          const serverFnBodyCode = extractServerFnBody(code, serverFnNode, filename, line)
          if (!serverFnBodyCode) return

          extractedAssertions.push({
            id,
            title: titleValue,
            key: keyValue,
            serverFnBodyCode,
            location: { file: filename, line, column },
          })

          s.overwrite(serverFnProp.start!, serverFnProp.end!, `__assertionId: ${JSON.stringify(id)}`)
          s.overwrite(callee.start!, callee.end!, '__createAssert')
          needsCreateAssertImport = true
        }
      },
    })
  }

  // Fifth pass: transform runAssert() calls (Svelte)
  if (runAssertLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        if (!t.isIdentifier(callee) || callee.name !== runAssertLocalName) {
          return
        }

        const args = path.node.arguments
        if (args.length < 1) {
          console.warn(`[vite-plugin-scenetest] runAssert() requires (config) at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const configArg = args[0]
        const loc = path.node.loc
        const line = loc?.start.line ?? 0
        const column = loc?.start.column ?? 0

        if (t.isObjectExpression(configArg)) {
          const { titleNode, keyNode, withDataNode, serverFnNode, serverFnProp } = extractConfigProps(configArg)

          if (!titleNode || !withDataNode || !serverFnNode || !serverFnProp) {
            console.warn(`[vite-plugin-scenetest] runAssert() config missing required properties at ${filename}:${line}`)
            return
          }

          let keyValue: string | undefined
          if (keyNode && t.isStringLiteral(keyNode)) {
            keyValue = keyNode.value
          }

          const id = keyValue
            ? `${filename}:${line}:${column}:${keyValue}`
            : `${filename}:${line}:${column}`

          let titleValue = 'assertion'
          if (t.isStringLiteral(titleNode)) {
            titleValue = titleNode.value
          }

          const serverFnBodyCode = extractServerFnBody(code, serverFnNode, filename, line)
          if (!serverFnBodyCode) return

          extractedAssertions.push({
            id,
            title: titleValue,
            key: keyValue,
            serverFnBodyCode,
            location: { file: filename, line, column },
          })

          s.overwrite(serverFnProp.start!, serverFnProp.end!, `__assertionId: ${JSON.stringify(id)}`)
          s.overwrite(callee.start!, callee.end!, '__runAssert')
          needsRunAssertImport = true
        }
      },
    })
  }

  if (!needsRpcImport && !needsUseAssertImport && !needsCreateAssertImport && !needsRunAssertImport) {
    return null
  }

  // Add imports at the top of the file
  // Find the position after existing imports
  let importInsertPos = 0
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) {
      importInsertPos = node.end! + 1
    } else {
      break
    }
  }

  if (needsRpcImport) {
    const rpcImport = `\nimport { __scenetest_rpc } from 'scenetest/runtime'\n`
    s.appendLeft(importInsertPos, rpcImport)
  }

  if (needsUseAssertImport) {
    // Import from the same package where useAssert was imported from
    const sourcePackage = useAssertSourcePackage || 'scenetest-react'
    const hookImport = `\nimport { __useAssert } from '${sourcePackage}'\n`
    s.appendLeft(importInsertPos, hookImport)
  }

  if (needsCreateAssertImport) {
    const solidImport = `\nimport { __createAssert } from 'scenetest-solid'\n`
    s.appendLeft(importInsertPos, solidImport)
  }

  if (needsRunAssertImport) {
    const svelteImport = `\nimport { __runAssert } from 'scenetest-svelte'\n`
    s.appendLeft(importInsertPos, svelteImport)
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
    extractedAssertions,
  }
}
