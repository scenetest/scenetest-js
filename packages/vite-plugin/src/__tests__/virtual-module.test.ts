import { describe, it, expect, beforeEach } from 'vitest'
import { parse } from '@babel/parser'
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
        params: 'server, data',
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
        params: 'server, data',
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
        params: 'server, data',
      },
      {
        id: 'assertion-2',
        title: 'assertion-2',
        location: { file: 'b.tsx', line: 2, column: 1 },
        serverFnBodyCode: 'should("second", false)',
        params: 'server, data',
      },
    ])

    const code = generateVirtualModuleCode()

    expect(code).toContain('"assertion-1"')
    expect(code).toContain('"assertion-2"')
    expect(code).toContain('should("first", true)')
    expect(code).toContain('should("second", false)')
  })

  it('should emit async wrappers so bodies using await parse', () => {
    registerAssertions([
      {
        id: 'async-id',
        title: 'async-id',
        location: { file: 'app.tsx', line: 5, column: 1 },
        serverFnBodyCode: 'const row = await server.db.find(data.id)\nshould("found", !!row)',
        params: 'server, data',
      },
    ])

    const code = generateVirtualModuleCode()

    expect(code).toContain('async (server, data, { should, failed })')
    // The whole module must be valid JS — `await` outside async would throw.
    expect(() => parse(code, { sourceType: 'module' })).not.toThrow()
  })

  it('should preserve a destructured data parameter', () => {
    registerAssertions([
      {
        id: 'destructured-id',
        title: 'destructured-id',
        location: { file: 'app.tsx', line: 7, column: 1 },
        serverFnBodyCode: 'const row = await server.db.find(id)\nshould("match", row?.status === status)',
        params: 'server, { id, status }',
      },
    ])

    const code = generateVirtualModuleCode()

    // Author destructured `data` — the wrapper must keep that pattern so the
    // body references (`id`, `status`) still resolve.
    expect(code).toContain('async (server, { id, status }, { should, failed })')
    expect(() => parse(code, { sourceType: 'module' })).not.toThrow()
  })

  it('should fall back to server, data when params are missing', () => {
    registerAssertions([
      {
        id: 'fallback-id',
        title: 'fallback-id',
        location: { file: 'app.tsx', line: 9, column: 1 },
        serverFnBodyCode: 'should("ok", true)',
        params: '',
      },
    ])

    const code = generateVirtualModuleCode()

    expect(code).toContain('async (server, data, { should, failed })')
  })
})
