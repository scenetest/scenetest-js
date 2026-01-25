import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAssertions,
  clearRegistry,
  generateVirtualModuleCode,
} from '../virtual-module.js'

describe('generateVirtualModuleCode', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('should generate empty object when no assertions registered', () => {
    const code = generateVirtualModuleCode()
    expect(code).toBe('export const assertions = {}')
  })

  it('should generate serverFn with { should, failed } parameters', () => {
    registerAssertions([
      {
        id: 'test-id',
        title: 'test-id',
        location: { file: 'test.tsx', line: 10, column: 1 },
        serverFnBodyCode: 'should("test", true)',
      },
    ])

    const code = generateVirtualModuleCode()

    // The generated code MUST use { should, failed } so that:
    // 1. User code can call should() and failed() in serverFn
    // 2. The middleware can pass { should, failed } helpers
    expect(code).toContain('{ should, failed }')
    expect(code).not.toContain('{ pass, fail }')
  })

  it('should inline the serverFn body code', () => {
    registerAssertions([
      {
        id: 'my-assertion',
        title: 'my-assertion',
        location: { file: 'app.tsx', line: 42, column: 1 },
        serverFnBodyCode: 'const result = server.validate(data.email)\nshould("email valid", result)',
      },
    ])

    const code = generateVirtualModuleCode()

    expect(code).toContain('server.validate(data.email)')
    expect(code).toContain('should("email valid", result)')
    expect(code).toContain('"my-assertion"')
  })

  it('should handle multiple assertions', () => {
    registerAssertions([
      {
        id: 'assertion-1',
        title: 'assertion-1',
        location: { file: 'a.tsx', line: 1, column: 1 },
        serverFnBodyCode: 'should("first", true)',
      },
      {
        id: 'assertion-2',
        title: 'assertion-2',
        location: { file: 'b.tsx', line: 2, column: 1 },
        serverFnBodyCode: 'should("second", false)',
      },
    ])

    const code = generateVirtualModuleCode()

    expect(code).toContain('"assertion-1"')
    expect(code).toContain('"assertion-2"')
    expect(code).toContain('should("first", true)')
    expect(code).toContain('should("second", false)')
  })
})
