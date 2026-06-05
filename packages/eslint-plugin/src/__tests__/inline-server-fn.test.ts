import { describe } from 'vitest'
import { RuleTester } from 'eslint'
import * as tsParser from '@typescript-eslint/parser'
import rule from '../rules/inline-server-fn.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

/** A test case parsed with the TypeScript parser. */
const ts = { languageOptions: { parser: tsParser } }

describe('inline-server-fn', () => {
  ruleTester.run('inline-server-fn', rule, {
    valid: [
      // Inline arrow function
      `import { serverCheck } from '@scenetest/checks'
       serverCheck('t', (server, data) => {})`,
      // Inline async arrow function
      `import { serverCheck } from '@scenetest/checks'
       serverCheck('t', async (server, data) => { await server.db.find(data.id) })`,
      // Inline function expression
      `import { serverCheck } from '@scenetest/checks'
       serverCheck('t', function (server, data) {})`,
      // Aliased import, still inline
      `import { serverCheck as sc } from '@scenetest/checks'
       sc('t', (server, data) => {})`,
      // No 2nd argument — not this rule's concern
      `import { serverCheck } from '@scenetest/checks'
       serverCheck('t')`,
      // serverCheck not imported from a scenetest package — different function
      `function serverCheck(a, b) {}
       const fn = () => {}
       serverCheck('t', fn)`,
      // TS: inline function wrapped in an `as` assertion (the plugin unwraps it)
      {
        code: `import { serverCheck } from '@scenetest/checks'
               serverCheck('t', ((server, data) => {}) as ServerFn)`,
        ...ts,
      },
    ],

    invalid: [
      // Variable reference — the reported bug
      {
        code: `import { serverCheck } from '@scenetest/checks'
               const fn = (server, data) => {}
               serverCheck('t', fn)`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'variable reference' } }],
      },
      // Property reference
      {
        code: `import { serverCheck } from '@scenetest/checks'
               serverCheck('t', handlers.check)`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'property reference' } }],
      },
      // Function call result
      {
        code: `import { serverCheck } from '@scenetest/checks'
               serverCheck('t', makeServerFn())`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'function call result' } }],
      },
      // Conditional expression
      {
        code: `import { serverCheck } from '@scenetest/checks'
               serverCheck('t', cond ? a : b)`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'conditional expression' } }],
      },
      // Aliased import + variable reference
      {
        code: `import { serverCheck as sc } from '@scenetest/checks'
               sc('t', fn)`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'variable reference' } }],
      },
      // TS: an `as` assertion around a variable reference is still not inline
      {
        code: `import { serverCheck } from '@scenetest/checks'
               serverCheck('t', fn as ServerFn)`,
        errors: [{ messageId: 'serverFnMustBeInline', data: { kind: 'variable reference' } }],
        ...ts,
      },
    ],
  })
})
