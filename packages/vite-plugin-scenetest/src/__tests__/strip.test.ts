import { describe, it, expect } from 'vitest'
import { stripScenetest } from '../strip.js'

describe('stripScenetest', () => {
  describe('import removal', () => {
    it('removes simple import statement', () => {
      const code = `import { should, failed } from 'scenetest'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('removes import with only should', () => {
      const code = `import { should } from 'scenetest'
console.log('hello')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with only failed', () => {
      const code = `import { failed } from 'scenetest'
console.log('hello')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with aliases', () => {
      const code = `import { should as s, failed as f } from 'scenetest'
s('test', true)
f('test')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })

    it('handles namespace import', () => {
      const code = `import * as scenetest from 'scenetest'
scenetest.should('test', true)
scenetest.failed('test')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })
  })

  describe('function call removal', () => {
    it('removes simple should() statement', () => {
      const code = `import { should } from 'scenetest'
should('description', true)
console.log('after')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes simple failed() statement', () => {
      const code = `import { failed } from 'scenetest'
failed('description')
console.log('after')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes multiple should/failed statements', () => {
      const code = `import { should, failed } from 'scenetest'
should('one', true)
console.log('middle')
failed('two')
should('three', true)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe(`console.log('middle')`)
    })

    it('removes should() with semicolon', () => {
      const code = `import { should } from 'scenetest'
should('test', true);
const x = 1;`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1;')
    })
  })

  describe('complex arguments', () => {
    it('handles nested function calls in condition', () => {
      const code = `import { should } from 'scenetest'
should('test', foo() && bar.baz())
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles template literals', () => {
      const code = `import { should } from 'scenetest'
const name = 'test'
should(\`checking \${name}\`, true)
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`const name = 'test'
const x = 1`)
    })

    it('handles object literals', () => {
      const code = `import { should } from 'scenetest'
should('test', { a: 1, b: 2 }.hasOwnProperty('a'))
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles array literals', () => {
      const code = `import { should } from 'scenetest'
should('test', [1, 2, 3].includes(2))
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles arrow functions', () => {
      const code = `import { should } from 'scenetest'
should('test', (() => true)())
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

    it('does not strip should() not from scenetest', () => {
      const code = `function should(msg, condition) { console.log(msg) }
should('test', true)
const x = 1`

      // No scenetest import, so no transformation
      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('does not strip when should/failed are from different module', () => {
      const code = `import { should } from 'other-module'
should('test', true)
const x = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('ignores strings containing "should("', () => {
      const code = `const x = "should('test', true)"
const y = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })

    it('ignores comments containing should()', () => {
      const code = `// should('test', true)
/* should('test', true) */
const x = 1`

      const result = stripScenetest(code)
      expect(result).toBeNull()
    })
  })

  describe('JSX support', () => {
    it('handles should() in JSX component', () => {
      const code = `import { should } from 'scenetest'

function Component() {
  should('component rendered', true)
  return <div>Hello</div>
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function Component()')
      expect(result!.code).toContain('return <div>Hello</div>')
      expect(result!.code).not.toContain('should(')
    })

    it('handles should() in JSX expression', () => {
      const code = `import { should } from 'scenetest'

function Component() {
  return (
    <div>
      {should('in jsx', true)}
      Hello
    </div>
  )
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      // In expression context, should() is replaced with void 0
      expect(result!.code).toContain('void 0')
      expect(result!.code).not.toContain("should('in jsx'")
    })
  })

  describe('TypeScript support', () => {
    it('handles TypeScript syntax', () => {
      const code = `import { should } from 'scenetest'

interface User {
  name: string
}

function greet(user: User): void {
  should('user has name', user.name.length > 0)
  console.log(user.name)
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('interface User')
      expect(result!.code).toContain('function greet(user: User)')
      expect(result!.code).toContain('console.log(user.name)')
      expect(result!.code).not.toContain('should(')
    })

    it('handles generic types', () => {
      const code = `import { should } from 'scenetest'

function identity<T>(value: T): T {
  should('identity called', true)
  return value
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function identity<T>')
      expect(result!.code).not.toContain('should(')
    })
  })

  describe('expression contexts (defensive)', () => {
    it('replaces should() in assignment with void 0', () => {
      const code = `import { should } from 'scenetest'
const x = should('test', true)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('const x = void 0')
    })

    it('replaces should() in logical expression with void 0', () => {
      const code = `import { should } from 'scenetest'
const x = condition && should('test', true)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('condition && void 0')
    })

    it('replaces should() in ternary with void 0', () => {
      const code = `import { should } from 'scenetest'
const x = cond ? should('a', true) : should('b', false)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('cond ? void 0 : void 0')
    })

    it('replaces should() in comma expression with void 0', () => {
      const code = `import { should } from 'scenetest'
const x = (should('test', true), 42)
console.log(x)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('(void 0, 42)')
    })
  })

  describe('source maps', () => {
    it('generates source map by default', () => {
      const code = `import { should } from 'scenetest'
should('test', true)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.map).not.toBeNull()
    })

    it('can disable source map', () => {
      const code = `import { should } from 'scenetest'
should('test', true)`

      const result = stripScenetest(code, { sourceMap: false })
      expect(result).not.toBeNull()
      expect(result!.map).toBeNull()
    })
  })

  describe('scenetest-vue imports', () => {
    it('removes import from scenetest-vue', () => {
      const code = `import { should, failed, useAssert } from 'scenetest-vue'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Vue component with scenetest-vue imports', () => {
      const code = `import { ref } from 'vue'
import { should, useAssert } from 'scenetest-vue'

const count = ref(0)
should('rendered', true)
useAssert({ title: 'test', withData: () => ({ count: count.value }), serverFn: () => {} }, [() => count.value])
console.log(count.value)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { ref } from 'vue'")
      expect(result!.code).not.toContain("from 'scenetest-vue'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('useAssert(')
    })
  })

  describe('scenetest-solid imports', () => {
    it('removes import from scenetest-solid', () => {
      const code = `import { should, failed, createAssert } from 'scenetest-solid'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Solid component with scenetest-solid imports', () => {
      const code = `import { createSignal } from 'solid-js'
import { should, createAssert } from 'scenetest-solid'

function Component() {
  const [count, setCount] = createSignal(0)
  should('rendered', true)
  createAssert({ title: 'test', withData: () => ({ count: count() }), serverFn: () => {} }, [count])
  return count()
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { createSignal } from 'solid-js'")
      expect(result!.code).not.toContain("from 'scenetest-solid'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('createAssert(')
    })
  })

  describe('scenetest-svelte imports', () => {
    it('removes import from scenetest-svelte', () => {
      const code = `import { should, failed, runAssert } from 'scenetest-svelte'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Svelte with scenetest-svelte imports', () => {
      const code = `import { should, runAssert } from 'scenetest-svelte'

let count = 0
should('rendered', true)
runAssert({ title: 'test', withData: () => ({ count }), serverFn: () => {} })
console.log(count)`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).not.toContain("from 'scenetest-svelte'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('runAssert(')
      expect(result!.code).toContain('let count = 0')
    })
  })

  describe('scenetest-react imports', () => {
    it('removes import from scenetest-react', () => {
      const code = `import { should, failed, useAssert } from 'scenetest-react'
const x = 1`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('removes should/failed/useAssert calls from scenetest-react', () => {
      const code = `import { should, failed, useAssert } from 'scenetest-react'
should('one', true)
failed('two')
useAssert({ title: 'test', withData: () => ({}), serverFn: () => {} }, [])
console.log('kept')`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe(`console.log('kept')`)
    })

    it('handles React component with scenetest-react imports', () => {
      const code = `import { useState } from 'react'
import { should, useAssert } from 'scenetest-react'

function Component() {
  const [count, setCount] = useState(0)
  should('rendered', true)
  useAssert({ title: 'test', withData: () => ({ count }), serverFn: () => {} }, [count])
  return <div>{count}</div>
}`

      const result = stripScenetest(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { useState } from 'react'")
      expect(result!.code).not.toContain("from 'scenetest-react'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('useAssert(')
      expect(result!.code).toContain('function Component()')
    })
  })

  describe('real-world example', () => {
    it('handles a React component with multiple assertions', () => {
      const code = `import { useState, useEffect } from 'react'
import { should, failed } from 'scenetest'

function ProfileForm() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  should('ProfileForm should render', true)

  useEffect(() => {
    fetchProfile().then(data => {
      setProfile(data)
      setLoading(false)
      should('Profile should load successfully', data !== null)
    }).catch(() => {
      failed('Profile fetch failed unexpectedly')
    })
  }, [])

  if (loading) {
    return <div>Loading...</div>
  }

  should('Profile data should be available', profile !== null)

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

      // Should remove all should/failed calls
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('failed(')

      // Should keep the component logic
      expect(result!.code).toContain('function ProfileForm()')
      expect(result!.code).toContain('useState(null)')
      expect(result!.code).toContain('useEffect(')
      expect(result!.code).toContain('fetchProfile()')
      expect(result!.code).toContain('return (')
    })
  })
})
