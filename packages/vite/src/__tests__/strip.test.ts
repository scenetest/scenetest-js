import { describe, it, expect } from 'vitest'
import { stripScenecheck } from '../strip.js'

describe('stripScenecheck', () => {
  describe('import removal', () => {
    it('removes simple import statement', () => {
      const code = `import { should, failed } from '@scenecheck/checks'
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('removes import with only should', () => {
      const code = `import { should } from '@scenecheck/checks'
console.log('hello')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with only failed', () => {
      const code = `import { failed } from '@scenecheck/checks'
console.log('hello')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('hello')`)
    })

    it('removes import with aliases', () => {
      const code = `import { should as s, failed as f } from '@scenecheck/checks'
s('test', true)
f('test')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })

    it('handles namespace import', () => {
      const code = `import * as scenecheck from '@scenecheck/checks'
scenecheck.should('test', true)
scenecheck.failed('test')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe('')
    })
  })

  describe('function call removal', () => {
    it('removes simple should() statement', () => {
      const code = `import { should } from '@scenecheck/checks'
should('description', true)
console.log('after')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes simple failed() statement', () => {
      const code = `import { failed } from '@scenecheck/checks'
failed('description')
console.log('after')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`console.log('after')`)
    })

    it('removes multiple should/failed statements', () => {
      const code = `import { should, failed } from '@scenecheck/checks'
should('one', true)
console.log('middle')
failed('two')
should('three', true)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe(`console.log('middle')`)
    })

    it('removes should() with semicolon', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', true);
const x = 1;`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1;')
    })
  })

  describe('complex arguments', () => {
    it('handles nested function calls in condition', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', foo() && bar.baz())
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles template literals', () => {
      const code = `import { should } from '@scenecheck/checks'
const name = 'test'
should(\`checking \${name}\`, true)
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe(`const name = 'test'
const x = 1`)
    })

    it('handles object literals', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', { a: 1, b: 2 }.hasOwnProperty('a'))
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles array literals', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', [1, 2, 3].includes(2))
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles arrow functions', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', (() => true)())
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })
  })

  describe('no-op cases', () => {
    it('returns null when no scenecheck import', () => {
      const code = `const x = 1
console.log(x)`

      const result = stripScenecheck(code)
      expect(result).toBeNull()
    })

    it('does not strip should() not from scenecheck', () => {
      const code = `function should(msg, condition) { console.log(msg) }
should('test', true)
const x = 1`

      // No scenecheck import, so no transformation
      const result = stripScenecheck(code)
      expect(result).toBeNull()
    })

    it('does not strip when should/failed are from different module', () => {
      const code = `import { should } from 'other-module'
should('test', true)
const x = 1`

      const result = stripScenecheck(code)
      expect(result).toBeNull()
    })

    it('ignores strings containing "should("', () => {
      const code = `const x = "should('test', true)"
const y = 1`

      const result = stripScenecheck(code)
      expect(result).toBeNull()
    })

    it('ignores comments containing should()', () => {
      const code = `// should('test', true)
/* should('test', true) */
const x = 1`

      const result = stripScenecheck(code)
      expect(result).toBeNull()
    })
  })

  describe('JSX support', () => {
    it('handles should() in JSX component', () => {
      const code = `import { should } from '@scenecheck/checks'

function Component() {
  should('component rendered', true)
  return <div>Hello</div>
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function Component()')
      expect(result!.code).toContain('return <div>Hello</div>')
      expect(result!.code).not.toContain('should(')
    })

    it('handles should() in JSX expression', () => {
      const code = `import { should } from '@scenecheck/checks'

function Component() {
  return (
    <div>
      {should('in jsx', true)}
      Hello
    </div>
  )
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      // In expression context, should() is replaced with void 0
      expect(result!.code).toContain('void 0')
      expect(result!.code).not.toContain("should('in jsx'")
    })
  })

  describe('TypeScript support', () => {
    it('handles TypeScript syntax', () => {
      const code = `import { should } from '@scenecheck/checks'

interface User {
  name: string
}

function greet(user: User): void {
  should('user has name', user.name.length > 0)
  console.log(user.name)
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('interface User')
      expect(result!.code).toContain('function greet(user: User)')
      expect(result!.code).toContain('console.log(user.name)')
      expect(result!.code).not.toContain('should(')
    })

    it('handles generic types', () => {
      const code = `import { should } from '@scenecheck/checks'

function identity<T>(value: T): T {
  should('identity called', true)
  return value
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('function identity<T>')
      expect(result!.code).not.toContain('should(')
    })
  })

  describe('expression contexts (defensive)', () => {
    it('replaces should() in assignment with void 0', () => {
      const code = `import { should } from '@scenecheck/checks'
const x = should('test', true)
console.log(x)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('const x = void 0')
    })

    it('replaces should() in logical expression with void 0', () => {
      const code = `import { should } from '@scenecheck/checks'
const x = condition && should('test', true)
console.log(x)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('condition && void 0')
    })

    it('replaces should() in ternary with void 0', () => {
      const code = `import { should } from '@scenecheck/checks'
const x = cond ? should('a', true) : should('b', false)
console.log(x)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('cond ? void 0 : void 0')
    })

    it('replaces should() in comma expression with void 0', () => {
      const code = `import { should } from '@scenecheck/checks'
const x = (should('test', true), 42)
console.log(x)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain('(void 0, 42)')
    })
  })

  describe('source maps', () => {
    it('generates source map by default', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', true)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.map).not.toBeNull()
    })

    it('can disable source map', () => {
      const code = `import { should } from '@scenecheck/checks'
should('test', true)`

      const result = stripScenecheck(code, { sourceMap: false })
      expect(result).not.toBeNull()
      expect(result!.map).toBeNull()
    })
  })

  describe('scenecheck-vue imports', () => {
    it('removes import from scenecheck-vue', () => {
      const code = `import { should, failed, watchCheck } from '@scenecheck/checks-vue'
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Vue component with scenecheck-vue imports', () => {
      const code = `import { ref } from 'vue'
import { should, watchCheck } from '@scenecheck/checks-vue'

const count = ref(0)
should('rendered', true)
watchCheck(() => { should('count is positive', count.value >= 0) })
console.log(count.value)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { ref } from 'vue'")
      expect(result!.code).not.toContain("from '@scenecheck/checks-vue'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('watchCheck(')
    })
  })

  describe('scenecheck-solid imports', () => {
    it('removes import from scenecheck-solid', () => {
      const code = `import { should, failed, createCheck } from '@scenecheck/checks-solid'
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Solid component with scenecheck-solid imports', () => {
      const code = `import { createSignal } from 'solid-js'
import { should, createCheck } from '@scenecheck/checks-solid'

function Component() {
  const [count, setCount] = createSignal(0)
  should('rendered', true)
  createCheck(() => { should('count is positive', count() >= 0) })
  return count()
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { createSignal } from 'solid-js'")
      expect(result!.code).not.toContain("from '@scenecheck/checks-solid'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('createCheck(')
    })
  })

  describe('scenecheck-svelte imports', () => {
    it('removes import from scenecheck-svelte', () => {
      const code = `import { should, failed, checkEffect } from '@scenecheck/checks-svelte'
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('handles Svelte with scenecheck-svelte imports', () => {
      const code = `import { should, checkEffect } from '@scenecheck/checks-svelte'

let count = 0
should('rendered', true)
checkEffect(() => { should('count is positive', count >= 0) })
console.log(count)`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).not.toContain("from '@scenecheck/checks-svelte'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('checkEffect(')
      expect(result!.code).toContain('let count = 0')
    })
  })

  describe('scenecheck-react imports', () => {
    it('removes import from scenecheck-react', () => {
      const code = `import { should, failed, useCheck } from '@scenecheck/checks-react'
const x = 1`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toBe('const x = 1')
    })

    it('removes should/failed/useCheck calls from scenecheck-react', () => {
      const code = `import { should, failed, useCheck } from '@scenecheck/checks-react'
should('one', true)
failed('two')
useCheck(() => { should('in effect', true) }, [])
console.log('kept')`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code.trim()).toBe(`console.log('kept')`)
    })

    it('handles React component with scenecheck-react imports', () => {
      const code = `import { useState } from 'react'
import { should, useCheck } from '@scenecheck/checks-react'

function Component() {
  const [count, setCount] = useState(0)
  should('rendered', true)
  useCheck(() => { should('count is positive', count >= 0) }, [count])
  return <div>{count}</div>
}`

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()
      expect(result!.code).toContain("import { useState } from 'react'")
      expect(result!.code).not.toContain("from '@scenecheck/checks-react'")
      expect(result!.code).not.toContain('should(')
      expect(result!.code).not.toContain('useCheck(')
      expect(result!.code).toContain('function Component()')
    })
  })

  describe('real-world example', () => {
    it('handles a React component with multiple assertions', () => {
      const code = `import { useState, useEffect } from 'react'
import { should, failed } from '@scenecheck/checks'

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

      const result = stripScenecheck(code)
      expect(result).not.toBeNull()

      // Should keep React import
      expect(result!.code).toContain("import { useState, useEffect } from 'react'")

      // Should remove scenecheck import
      expect(result!.code).not.toContain("from '@scenecheck/checks'")

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
