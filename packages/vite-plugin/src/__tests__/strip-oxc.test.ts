import { describe, it, expect } from 'vitest'
import { stripScenetest } from '../strip.js'
import { stripScenetestOxc } from '../strip-oxc.js'

// Cross-implementation parity check: runs a representative set of cases
// through both the babel-based stripper and the oxc-based prototype and
// confirms they produce the same output. The full behavior matrix lives
// in strip.test.ts.
describe('stripScenetestOxc — parity with babel implementation', () => {
  const cases: Array<{ name: string; code: string; expected: 'null' | 'match' }> = [
    {
      name: 'no scenetest import → null',
      code: `const x = 1\nconsole.log(x)`,
      expected: 'null',
    },
    {
      name: 'simple import + call',
      code: `import { should } from '@scenetest/checks'\nshould('test', true)\nconsole.log('after')`,
      expected: 'match',
    },
    {
      name: 'aliased imports',
      code: `import { should as s, failed as f } from '@scenetest/checks'\ns('a', true)\nf('b')`,
      expected: 'match',
    },
    {
      name: 'namespace import',
      code: `import * as scenetest from '@scenetest/checks'\nscenetest.should('a', true)\nscenetest.failed('b')`,
      expected: 'match',
    },
    {
      name: 'expression context → void 0',
      code: `import { should } from '@scenetest/checks'\nconst x = cond ? should('a', true) : should('b', false)\nconsole.log(x)`,
      expected: 'match',
    },
    {
      name: 'JSX child expression',
      code: `import { should } from '@scenetest/checks'
function C() {
  return (
    <div>
      {should('in jsx', true)}
      Hello
    </div>
  )
}`,
      expected: 'match',
    },
    {
      name: 'TypeScript generics + interfaces',
      code: `import { should } from '@scenetest/checks'
interface User { name: string }
function identity<T>(value: T): T {
  should('called', true)
  return value
}`,
      expected: 'match',
    },
    {
      name: 'checks-react useCheck',
      code: `import { useState } from 'react'
import { should, useCheck } from '@scenetest/checks-react'
function C() {
  const [n] = useState(0)
  should('rendered', true)
  useCheck(() => { should('positive', n >= 0) }, [n])
  return <div>{n}</div>
}`,
      expected: 'match',
    },
    {
      name: 'should() in logical expression',
      code: `import { should } from '@scenetest/checks'\nconst x = condition && should('test', true)\nconsole.log(x)`,
      expected: 'match',
    },
    {
      name: 'multiple statements interleaved',
      code: `import { should, failed } from '@scenetest/checks'\nshould('one', true)\nconsole.log('middle')\nfailed('two')\nshould('three', true)`,
      expected: 'match',
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const babel = stripScenetest(c.code, { sourceMap: false, filename: 'test.tsx' })
      const oxc = stripScenetestOxc(c.code, { sourceMap: false, filename: 'test.tsx' })

      if (c.expected === 'null') {
        expect(babel).toBeNull()
        expect(oxc).toBeNull()
        return
      }

      expect(babel).not.toBeNull()
      expect(oxc).not.toBeNull()
      expect(oxc!.code).toBe(babel!.code)
    })
  }
})
