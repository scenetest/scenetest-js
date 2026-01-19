import { parse, type ParserOptions } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'

// Handle ESM/CJS interop for @babel/traverse
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as any).default) as typeof _traverse

/**
 * Extracted assertion from an assertion() call
 */
export interface ExtractedAssertion {
  /** Unique identifier (filename:line:col:key?) */
  id: string
  /** Human-readable title from the config */
  title: string
  /** Optional key for disambiguation */
  key?: string
  /** The assertFn body code (without function wrapper) */
  assertFnBodyCode: string
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
 * Transform assertion() and useAssertEffect() calls in source code.
 *
 * For assertion() calls:
 * 1. Extract the assertFn to be run on the server
 * 2. Replace the call with __scenetest_rpc({ id, title, key?, appData })
 *
 * For useAssertEffect() calls:
 * 1. Find return statements in the factory that return config with assertFn
 * 2. Extract the assertFn to be run on the server
 * 3. Replace assertFn with __assertionId in the returned object
 * 4. Replace useAssertEffect with __useAssertEffect
 *
 * @param code Source code to transform
 * @param options Transform options
 * @returns Transformed code, source map, and extracted assertions
 */
export function transformAssertions(code: string, options: TransformOptions = {}): TransformResult | null {
  const { sourceMap = true, filename = 'unknown.js' } = options

  // Quick check - if no assertion call, skip
  if (!code.includes('assertion') && !code.includes('useAssertEffect') && !code.includes('useServerAssert')) {
    return null
  }

  // Track imported names from scenetest
  let assertionLocalName: string | null = null
  let useAssertEffectLocalName: string | null = null
  let useServerAssertLocalName: string | null = null

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
  let needsUseAssertEffectImport = false

  // First pass: find imports from scenetest
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      if (source !== 'scenetest') {
        return
      }

      for (const specifier of path.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          if (imported === 'assertion') {
            assertionLocalName = specifier.local.name
          } else if (imported === 'useAssertEffect') {
            useAssertEffectLocalName = specifier.local.name
          } else if (imported === 'useServerAssert') {
            useServerAssertLocalName = specifier.local.name
          }
        }
      }
    },
  })

  if (!assertionLocalName && !useAssertEffectLocalName && !useServerAssertLocalName) {
    return null
  }

  // Second pass: transform assertion() calls
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee

      // Check if this is an assertion() call
      if (!t.isIdentifier(callee) || callee.name !== assertionLocalName) {
        return
      }

      // Get the config object argument
      const args = path.node.arguments
      if (args.length !== 1 || !t.isObjectExpression(args[0])) {
        console.warn(`[vite-plugin-scenetest] assertion() requires a single config object at ${filename}:${path.node.loc?.start.line}`)
        return
      }

      const configObj = args[0]
      let titleNode: t.Node | null = null
      let keyNode: t.Node | null = null
      let appDataNode: t.Node | null = null
      let assertFnNode: t.Node | null = null

      // Extract properties from the config object
      for (const prop of configObj.properties) {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
          continue
        }

        const keyName = prop.key.name
        if (keyName === 'title') {
          titleNode = prop.value
        } else if (keyName === 'key') {
          keyNode = prop.value
        } else if (keyName === 'appData') {
          appDataNode = prop.value
        } else if (keyName === 'assertFn') {
          assertFnNode = prop.value
        }
      }

      if (!titleNode || !appDataNode || !assertFnNode) {
        console.warn(`[vite-plugin-scenetest] assertion() missing required properties at ${filename}:${path.node.loc?.start.line}`)
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

      // Extract assertFn body code
      // The assertFn should be an arrow function or function expression
      let assertFnBodyCode: string
      if (t.isArrowFunctionExpression(assertFnNode) || t.isFunctionExpression(assertFnNode)) {
        const body = assertFnNode.body
        if (t.isBlockStatement(body)) {
          // Block body: { ... } - extract just the statements inside
          // Remove the outer braces
          const bodyCode = code.slice(body.start!, body.end!)
          assertFnBodyCode = bodyCode.slice(1, -1).trim() // Remove { and }
        } else {
          // Expression body: () => expr - wrap in return
          assertFnBodyCode = `return ${code.slice(body.start!, body.end!)}`
        }
      } else {
        // Fallback: use the whole code (might not work perfectly)
        console.warn(`[vite-plugin-scenetest] assertFn is not a function at ${filename}:${line}`)
        assertFnBodyCode = code.slice(assertFnNode.start!, assertFnNode.end!)
      }

      // Store extracted assertion
      extractedAssertions.push({
        id,
        title: titleValue,
        key: keyValue,
        assertFnBodyCode,
        location: { file: filename, line, column },
      })

      // Build the replacement RPC call
      // __scenetest_rpc({ id: "...", title: "...", key?: "...", appData: () => ... })
      const appDataCode = code.slice(appDataNode.start!, appDataNode.end!)

      let rpcCall = `__scenetest_rpc({ id: ${JSON.stringify(id)}, title: ${JSON.stringify(titleValue)}`
      if (keyValue) {
        rpcCall += `, key: ${JSON.stringify(keyValue)}`
      }
      rpcCall += `, appData: ${appDataCode} })`

      // Replace the assertion() call with the RPC call
      s.overwrite(path.node.start!, path.node.end!, rpcCall)
      needsRpcImport = true
    },
  })

  // Third pass: transform useAssertEffect() calls
  if (useAssertEffectLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        // Check if this is a useAssertEffect() call
        if (!t.isIdentifier(callee) || callee.name !== useAssertEffectLocalName) {
          return
        }

        // Get arguments: (factory, deps)
        const args = path.node.arguments
        if (args.length < 1) {
          console.warn(`[vite-plugin-scenetest] useAssertEffect() requires a factory function at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const factoryArg = args[0]
        if (!t.isArrowFunctionExpression(factoryArg) && !t.isFunctionExpression(factoryArg)) {
          console.warn(`[vite-plugin-scenetest] useAssertEffect() factory must be a function at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        // Find return statements in the factory that return object literals with assertFn
        const factoryBody = factoryArg.body

        // Helper to process a return value (object literal)
        const processReturnValue = (returnValue: t.Node, returnStart: number, returnEnd: number) => {
          if (!t.isObjectExpression(returnValue)) {
            return // Could be null or other value
          }

          // Find assertFn property
          let assertFnProp: t.ObjectProperty | null = null
          let assertFnNode: t.Node | null = null
          let titleNode: t.Node | null = null
          let keyNode: t.Node | null = null
          let appDataNode: t.Node | null = null

          for (const prop of returnValue.properties) {
            if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
              continue
            }
            const keyName = prop.key.name
            if (keyName === 'assertFn') {
              assertFnProp = prop
              assertFnNode = prop.value
            } else if (keyName === 'title') {
              titleNode = prop.value
            } else if (keyName === 'key') {
              keyNode = prop.value
            } else if (keyName === 'appData') {
              appDataNode = prop.value
            }
          }

          if (!assertFnNode || !assertFnProp) {
            return // No assertFn in this return
          }

          // Get location for ID generation
          const loc = returnValue.loc
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
          if (titleNode && t.isStringLiteral(titleNode)) {
            titleValue = titleNode.value
          }

          // Extract assertFn body code
          let assertFnBodyCode: string
          if (t.isArrowFunctionExpression(assertFnNode) || t.isFunctionExpression(assertFnNode)) {
            const body = assertFnNode.body
            if (t.isBlockStatement(body)) {
              const bodyCode = code.slice(body.start!, body.end!)
              assertFnBodyCode = bodyCode.slice(1, -1).trim()
            } else {
              assertFnBodyCode = `return ${code.slice(body.start!, body.end!)}`
            }
          } else {
            console.warn(`[vite-plugin-scenetest] assertFn is not a function at ${filename}:${line}`)
            assertFnBodyCode = code.slice(assertFnNode.start!, assertFnNode.end!)
          }

          // Store extracted assertion
          extractedAssertions.push({
            id,
            title: titleValue,
            key: keyValue,
            assertFnBodyCode,
            location: { file: filename, line, column },
          })

          // Replace assertFn property with __assertionId
          // We need to replace "assertFn: ..." with "__assertionId: ..."
          const assertFnPropStart = assertFnProp.start!
          const assertFnPropEnd = assertFnProp.end!
          s.overwrite(assertFnPropStart, assertFnPropEnd, `__assertionId: ${JSON.stringify(id)}`)

          needsUseAssertEffectImport = true
        }

        if (t.isBlockStatement(factoryBody)) {
          // Block body: find all return statements
          traverse(factoryBody, {
            ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
              if (returnPath.node.argument) {
                processReturnValue(
                  returnPath.node.argument,
                  returnPath.node.start!,
                  returnPath.node.end!
                )
              }
            },
          }, path.scope, path.state, path)
        } else {
          // Expression body (implicit return)
          processReturnValue(factoryBody, factoryBody.start!, factoryBody.end!)
        }

        // Replace useAssertEffect with __useAssertEffect
        if (needsUseAssertEffectImport) {
          s.overwrite(callee.start!, callee.end!, '__useAssertEffect')
        }
      },
    })
  }

  // Fourth pass: transform useServerAssert() calls
  let needsUseServerAssertImport = false
  if (useServerAssertLocalName) {
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee

        // Check if this is a useServerAssert() call
        if (!t.isIdentifier(callee) || callee.name !== useServerAssertLocalName) {
          return
        }

        // Get arguments: (assertFn, appData, deps)
        const args = path.node.arguments
        if (args.length < 2) {
          console.warn(`[vite-plugin-scenetest] useServerAssert() requires (assertFn, appData, deps) at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        const assertFnArg = args[0]
        const appDataArg = args[1]
        const depsArg = args[2]

        if (!t.isArrowFunctionExpression(assertFnArg) && !t.isFunctionExpression(assertFnArg)) {
          console.warn(`[vite-plugin-scenetest] useServerAssert() first argument must be a function at ${filename}:${path.node.loc?.start.line}`)
          return
        }

        // Get location for ID generation
        const loc = path.node.loc
        const line = loc?.start.line ?? 0
        const column = loc?.start.column ?? 0

        // Generate assertion ID
        const id = `${filename}:${line}:${column}`

        // Extract assertFn body code
        let assertFnBodyCode: string
        const body = assertFnArg.body
        if (t.isBlockStatement(body)) {
          const bodyCode = code.slice(body.start!, body.end!)
          assertFnBodyCode = bodyCode.slice(1, -1).trim()
        } else {
          assertFnBodyCode = `return ${code.slice(body.start!, body.end!)}`
        }

        // Store extracted assertion
        extractedAssertions.push({
          id,
          title: 'server assertion',
          assertFnBodyCode,
          location: { file: filename, line, column },
        })

        // Build the replacement call
        // __useServerAssert(appData === undefined ? undefined : { __assertionId, appData }, deps)
        const appDataCode = code.slice(appDataArg.start!, appDataArg.end!)
        const depsCode = depsArg ? code.slice(depsArg.start!, depsArg.end!) : '[]'

        const replacement = `__useServerAssert(${appDataCode} == null ? undefined : { __assertionId: ${JSON.stringify(id)}, appData: ${appDataCode} }, ${depsCode})`

        s.overwrite(path.node.start!, path.node.end!, replacement)
        needsUseServerAssertImport = true
      },
    })
  }

  if (!needsRpcImport && !needsUseAssertEffectImport && !needsUseServerAssertImport) {
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

  if (needsUseAssertEffectImport) {
    const hookImport = `\nimport { __useAssertEffect } from 'scenetest'\n`
    s.appendLeft(importInsertPos, hookImport)
  }

  if (needsUseServerAssertImport) {
    const hookImport = `\nimport { __useServerAssert } from 'scenetest'\n`
    s.appendLeft(importInsertPos, hookImport)
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
