import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse } from '@babel/parser'
import { transformAssertions } from '../transform.js'
import {
  registerAssertions,
  clearRegistry,
  generateVirtualModuleCode,
} from '../virtual-module.js'

describe('transformAssertions — serverCheck extraction', () => {
  it('returns null when there is no serverCheck call', () => {
    expect(transformAssertions('export const x = 1')).toBeNull()
  })

  it('extracts an async serverFn body and its parameters', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck(
  'row matches',
  async (server, data) => {
    const { data: row } = await server.supabase
      .from('user_card').select().eq('id', data.id).maybeSingle()
    should('status matches', row?.status === data.status)
  },
  () => ({ id: 1, status: 'ok' }),
)
`
    const result = transformAssertions(code, { filename: '/abs/file.ts' })
    expect(result).not.toBeNull()
    expect(result!.extractedAssertions).toHaveLength(1)

    const extracted = result!.extractedAssertions[0]
    expect(extracted.title).toBe('row matches')
    expect(extracted.params).toBe('server, data')
    expect(extracted.serverFnBodyCode).toContain('await server.supabase')

    // The call is replaced with an RPC call carrying withData.
    expect(result!.code).toContain('__scenetest_rpc(')
    expect(result!.code).toContain('withData:')
  })

  it('preserves a destructured data parameter', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck('has id', async (server, { id }) => {
  const row = await server.db.find(id)
  should('found', !!row)
})
`
    const result = transformAssertions(code, { filename: 'file.ts' })
    expect(result!.extractedAssertions[0].params).toBe('server, { id }')
  })

  it('strips TypeScript type annotations from parameters', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck('typed', async (server: ServerContext, data: { id: number }) => {
  should('ok', true)
})
`
    const result = transformAssertions(code, { filename: 'file.ts' })
    expect(result!.extractedAssertions[0].params).toBe('server, data')
  })

  it('falls back to canonical names when parameters are omitted', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck('no params', async () => {
  should('ok', true)
})
`
    const result = transformAssertions(code, { filename: 'file.ts' })
    expect(result!.extractedAssertions[0].params).toBe('server, data')
  })

  it('unwraps a TS "as" assertion around the serverFn', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck('wrapped', (async (server, data) => {
  should('ok', true)
}) as ServerFn)
`
    const result = transformAssertions(code, { filename: 'file.ts' })
    expect(result!.extractedAssertions).toHaveLength(1)
    expect(result!.extractedAssertions[0].params).toBe('server, data')
  })

  it('warns and skips when the serverFn is a variable reference', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const code = `
import { serverCheck } from '@scenetest/checks'

const fn = async (server, data) => {}
serverCheck('by reference', fn)
`
    const result = transformAssertions(code, { filename: 'file.ts' })
    expect(result).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('must be an inline function'))
    warn.mockRestore()
  })
})

describe('transformAssertions + generateVirtualModuleCode integration', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('produces a virtual module that parses when the body uses await', () => {
    const code = `
import { serverCheck, should } from '@scenetest/checks'

serverCheck('row matches', async (server, { id, status }) => {
  const { data: row } = await server.supabase
    .from('user_card').select().eq('id', id).maybeSingle()
  should('status matches', row?.status === status)
})
`
    const result = transformAssertions(code, { filename: '/abs/file.ts' })
    registerAssertions(result!.extractedAssertions)

    const moduleCode = generateVirtualModuleCode()
    expect(moduleCode).toContain('async (server, { id, status }, { should, failed })')
    // Regression: an `await` body inside a non-async wrapper fails to parse.
    expect(() => parse(moduleCode, { sourceType: 'module' })).not.toThrow()
  })
})
