import { describe, it, expect } from 'vitest'
import { stripScenetest } from '../strip.js'

describe('stripScenetest', () => {
  describe('import removal', () => {
    it('removes simple import statement', () => {
      const code = `import { pass, fail } from 'scenetest'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('removes import with only pass', () => {
      const code = `import { pass } from 'scenetest'
console.log('hello')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with only fail', () => {
      const code = `import { fail } from 'scenetest'
console.log('hello')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with aliases', () => {
      const code = `import { pass as p, fail as f } from 'scenetest'
p('test', true)
f('test', false)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })

    it('handles namespace import', () => {
      const code = `import * as scenetest from 'scenetest'
scenetest.pass('test', true)
scenetest.fail('test', false)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })
  })

  describe('function call removal', () => {
    it('removes simple pass() statement', () => {
      const code = `import { pass } from 'scenetest'
pass('description', true)
console.log('after')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes simple fail() statement', () => {
      const code = `import { fail } from 'scenetest'
fail('description', false)
console.log('after')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes multiple pass/fail statements', () => {
      const code = `import { pass, fail } from 'scenetest'
pass('one', true)
console.log('middle')
fail('two', false)
pass('three', true)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe(`console.log('middle')`)
    })

    it('removes pass() with semicolon', () => {
      const code = `import { pass } from 'scenetest'
pass('test', true);
const x = 1;`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1;')
    })
  })

  describe('complex arguments', () => {
    it('handles nested function calls in condition', () => {
      const code = `import { pass } from 'scenetest'
pass('test', foo() && bar.baz())
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles template literals', () => {
      const code = `import { pass } from 'scenetest'
const name = 'test'
pass(\`checking \${name}\`, true)
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`const name = 'test'
const x = 1`)
    })

    it('handles object literals', () => {
      const code = `import { pass } from 'scenetest'
pass('test', { a: 1, b: 2 }.hasOwnProperty('a'))
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles array literals', () => {
      const code = `import { pass } from 'scenetest'
pass('test', [1, 2, 3].includes(2))
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles arrow functions', () => {
      const code = `import { pass } from 'scenetest'
pass('test', (() => true)())
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })
  })

  describe('no-op cases', () => {
    it('returns null when no scenetest import', () => {
      const code = `const x = 1
console.log(x)`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('does not strip pass() not from scenetest', () => {
      const code = `function pass(msg, condition) { console.log(msg) }
pass('test', true)
const x = 1`

      // No scenetest import, so no transformation
      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('does not strip when pass/fail are from different module', () => {
      const code = `import { pass } from 'other-module'
pass('test', true)
const x = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('ignores strings containing "pass("', () => {
      const code = `const x = "pass('test', true)"
const y = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('ignores comments containing pass()', () => {
      const code = `// pass('test', true)
/* pass('test', true) */
const x = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })
  })

  describe('JSX support', () => {
    it('handles pass() in JSX component', () => {
      const code = `import { pass } from 'scenetest'

function Component() {
  pass('component rendered', true)
  return <div>Hello</div>
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function Component()')
      expect(result!.code).toContain('return <div>Hello</div>')
      expect(result!.code).not.toContain('pass(')
    })

    it('handles pass() in JSX expression', () => {
      const code = `import { pass } from 'scenetest'

function Component() {
  return (
    <div>
      {pass('in jsx', true)}
      Hello
    </div>
  )
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      // In expression context, pass() is replaced with void 0
      expect(result!.code).toContain('void 0')
      expect(result!.code).not.toContain("pass('in jsx'")
    })
  })

  describe('TypeScript support', () => {
    it('handles TypeScript syntax', () => {
      const code = `import { pass } from 'scenetest'

interface User {
  name: string
}

function greet(user: User): void {
  pass('user has name', user.name.length > 0)
  console.log(user.name)
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('interface User')
      expect(result!.code).toContain('function greet(user: User)')
      expect(result!.code).toContain('console.log(user.name)')
      expect(result!.code).not.toContain('pass(')
    })

    it('handles generic types', () => {
      const code = `import { pass } from 'scenetest'

function identity<T>(value: T): T {
  pass('identity called', true)
  return value
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function identity<T>')
      expect(result!.code).not.toContain('pass(')
    })
  })

  describe('expression contexts (defensive)', () => {
    it('replaces pass() in assignment with void 0', () => {
      const code = `import { pass } from 'scenetest'
const x = pass('test', true)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('const x = void 0')
    })

    it('replaces pass() in logical expression with void 0', () => {
      const code = `import { pass } from 'scenetest'
const x = condition && pass('test', true)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('condition && void 0')
    })

    it('replaces pass() in ternary with void 0', () => {
      const code = `import { pass } from 'scenetest'
const x = cond ? pass('a', true) : pass('b', false)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('cond ? void 0 : void 0')
    })

    it('replaces pass() in comma expression with void 0', () => {
      const code = `import { pass } from 'scenetest'
const x = (pass('test', true), 42)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('(void 0, 42)')
    })
  })

  describe('source maps', () => {
    it('generates source map by default', () => {
      const code = `import { pass } from 'scenetest'
pass('test', true)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.map).not.toBeNull()
    })

    it('can disable source map', () => {
      const code = `import { pass } from 'scenetest'
pass('test', true)`

      const result = stripScenetest(code, { sourceMap: false })
      expect(result).not.toBeNull()
      expect(result!.map).toBeNull()
    })
  })

  describe('real-world example', () => {
    it('handles a React component with multiple assertions', () => {
      const code = `import { useState, useEffect } from 'react'
import { pass, fail } from 'scenetest'

function ProfileForm() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  pass('ProfileForm rendered', true)
  fail('ProfileForm should not render with error', false)

  useEffect(() => {
    fetchProfile().then(data => {
      setProfile(data)
      setLoading(false)
      pass('Profile loaded successfully', data !== null)
    })
  }, [])

  if (loading) {
    return <div>Loading...</div>
  }

  pass('Profile data available', profile !== null)

  return (
    <form>
      <input value={profile?.name ?? ''} />
    </form>
  )
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()

      // Should keep React import
      expect(result!.code).toContain("import { useState, useEffect } from 'react'")

      // Should remove scenetest import
      expect(result!.code).not.toContain("from 'scenetest'")

      // Should remove all pass/fail calls
      expect(result!.code).not.toContain('pass(')
      expect(result!.code).not.toContain('fail(')

      // Should keep the component logic
      expect(result!.code).toContain('function ProfileForm()')
      expect(result!.code).toContain('useState(null)')
      expect(result!.code).toContain('useEffect(')
      expect(result!.code).toContain('fetchProfile()')
      expect(result!.code).toContain('return (')
    })
  })
})
