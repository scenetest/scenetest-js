import type { Rule } from 'eslint'

/**
 * Scenetest packages that may export `serverCheck`.
 */
const SCENETEST_PACKAGES = new Set([
  '@scenetest/checks',
  '@scenetest/checks-react',
  '@scenetest/checks-vue',
  '@scenetest/checks-solid',
  '@scenetest/checks-svelte',
])

/**
 * Node types the Vite plugin can statically extract as the server function.
 */
const INLINE_FN_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression'])

/**
 * TypeScript-only wrappers the Vite plugin unwraps before extraction, e.g.
 * `((server, data) => {}) as ServerFn`.
 */
const TS_WRAPPER_TYPES = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
])

interface Node {
  type: string
  expression?: Node
}

interface ImportSpecifierNode {
  type: string
  imported?: { type: string; name?: string; value?: string }
  local: { name: string }
}

interface ImportDeclarationNode {
  source: { value: string }
  specifiers: ImportSpecifierNode[]
}

interface CallExpressionNode {
  callee: { type: string; name?: string }
  arguments: Node[]
}

/**
 * Strip TS-only wrappers so we inspect the underlying expression — the same
 * unwrapping the Vite plugin's transform does.
 */
function unwrap(node: Node): Node {
  let current = node
  while (TS_WRAPPER_TYPES.has(current.type) && current.expression) {
    current = current.expression
  }
  return current
}

/**
 * Human-readable description of why a node is not an inline function.
 */
function describe(type: string): string {
  switch (type) {
    case 'Identifier':
      return 'variable reference'
    case 'MemberExpression':
      return 'property reference'
    case 'CallExpression':
      return 'function call result'
    case 'ConditionalExpression':
      return 'conditional expression'
    default:
      return 'non-function value'
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require serverCheck()'s server function to be an inline function so the Vite plugin can statically extract it",
      recommended: true,
    },
    schema: [],
    messages: {
      serverFnMustBeInline:
        "serverCheck()'s second argument must be an inline function. A {{ kind }} cannot be statically " +
        'extracted by the Vite plugin — inline the function literal.',
    },
  },

  create(context) {
    // Local names bound to an imported `serverCheck` from a scenetest package.
    const serverCheckNames = new Set<string>()

    return {
      ImportDeclaration(node: unknown) {
        const decl = node as unknown as ImportDeclarationNode
        if (!SCENETEST_PACKAGES.has(decl.source.value)) return
        for (const spec of decl.specifiers) {
          if (spec.type !== 'ImportSpecifier' || !spec.imported) continue
          const importedName =
            spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
          if (importedName === 'serverCheck') {
            serverCheckNames.add(spec.local.name)
          }
        }
      },

      CallExpression(node: unknown) {
        const call = node as unknown as CallExpressionNode
        const callee = call.callee
        if (callee.type !== 'Identifier' || !callee.name || !serverCheckNames.has(callee.name)) {
          return
        }

        // serverCheck(title, serverFn, withData?) — inspect the serverFn.
        const serverFnArg = call.arguments[1]
        if (!serverFnArg || serverFnArg.type === 'SpreadElement') return

        const unwrapped = unwrap(serverFnArg)
        if (INLINE_FN_TYPES.has(unwrapped.type)) return

        context.report({
          node: serverFnArg as unknown as Rule.Node,
          messageId: 'serverFnMustBeInline',
          data: { kind: describe(unwrapped.type) },
        })
      },
    }
  },
}

export default rule
