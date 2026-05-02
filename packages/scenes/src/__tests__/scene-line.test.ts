import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerScene,
  setCurrentFile,
  setNextSceneLine,
  sceneRegistry,
} from '../scene.js'
import { parseMarkdownScenes, registerMarkdownScenes } from '../markdown-scene.js'

beforeEach(() => {
  sceneRegistry.length = 0
  setCurrentFile('')
  setNextSceneLine(undefined)
})

describe('registerScene line capture', () => {
  it('uses the explicit line set via setNextSceneLine', () => {
    setCurrentFile('/abs/test.spec.ts')
    setNextSceneLine(42)
    registerScene('explicit', async () => {})
    expect(sceneRegistry[0]?.line).toBe(42)
  })

  it('clears the explicit line after one registration', () => {
    setCurrentFile('/abs/test.spec.ts')
    setNextSceneLine(42)
    registerScene('first', async () => {})
    registerScene('second', async () => {})
    expect(sceneRegistry[0]?.line).toBe(42)
    // Second one shouldn't reuse the explicit line. It will fall back to the
    // stack-parse path, which won't find /abs/test.spec.ts in this test's
    // call stack — so line should be undefined.
    expect(sceneRegistry[1]?.line).toBeUndefined()
  })

  it('falls back to a stack-parsed line when currentFile matches the call site', () => {
    // Simulate the runner: pretend this very test file is the scene file.
    // The stack of a registerScene() call from inside this `it` block will
    // contain a frame referencing this test file, with its line number.
    setCurrentFile(__filename)
    registerScene('stack-line', async () => {}); const lineHere = stackLine()
    // We don't know the exact line the stack frame reports for the
    // registerScene call (transpilation can shift it), but it should be
    // a positive integer near the current source line.
    const captured = sceneRegistry[0]?.line
    expect(captured).toBeTypeOf('number')
    expect(captured!).toBeGreaterThan(0)
    expect(Math.abs(captured! - lineHere)).toBeLessThan(50)
  })

  it('omits line entirely when the stack does not reference currentFile', () => {
    setCurrentFile('/totally/unrelated/file.ts')
    registerScene('no-stack-match', async () => {})
    expect(sceneRegistry[0]?.line).toBeUndefined()
  })
})

// helper used only by the stack-parse case above; declared after the test
// for readability — its line is captured as the "expected near" anchor.
function stackLine(): number {
  const m = new Error().stack!.match(/scene-line\.test\.[tj]s:(\d+):\d+/)
  return m ? parseInt(m[1], 10) : 0
}

describe('parseMarkdownScenes line tracking', () => {
  it('records the heading line for # scenes', () => {
    const content = [
      '',                       // 1
      '# Scene one',            // 2
      '',                       // 3
      'user:',                  // 4
      'click submit',           // 5
      '',                       // 6
      '# Scene two',            // 7
      '',                       // 8
      'user:',                  // 9
      'click logout',           // 10
    ].join('\n')

    const scenes = parseMarkdownScenes(content, '/test/login.spec.md')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].line).toBe(2)
    expect(scenes[1].line).toBe(7)
  })

  it('records the heading line for ## scenes under # groups', () => {
    const content = [
      '# Login flow',           // 1
      '',                       // 2
      '## happy path',          // 3
      '',                       // 4
      'user:',                  // 5
      'click submit',           // 6
      '',                       // 7
      '## sad path',            // 8
      '',                       // 9
      'user:',                  // 10
      'click cancel',           // 11
    ].join('\n')

    const scenes = parseMarkdownScenes(content, '/test/login.spec.md')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].line).toBe(3)
    expect(scenes[1].line).toBe(8)
  })

  it('records the first content line for headless scenes', () => {
    const content = [
      '',           // 1
      '',           // 2
      'user:',      // 3 — first content line, no heading
      'openTo /',   // 4
    ].join('\n')

    const scenes = parseMarkdownScenes(content, '/test/headless.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].line).toBe(3)
  })

  it('propagates the heading line into RegisteredScene.line', () => {
    const content = [
      '# First',     // 1
      'user:',       // 2
      'click x',     // 3
      '',
      '# Second',    // 5
      'user:',       // 6
      'click y',     // 7
    ].join('\n')

    const scenes = parseMarkdownScenes(content, '/test/multi.spec.md')
    setCurrentFile('/test/multi.spec.md')
    registerMarkdownScenes(scenes, '/test/multi.spec.md')

    expect(sceneRegistry).toHaveLength(2)
    expect(sceneRegistry[0].line).toBe(1)
    expect(sceneRegistry[1].line).toBe(5)
  })
})
