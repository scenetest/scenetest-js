/**
 * Tests for the lazy/callback forms of should() and failed().
 *
 * should() accepts either a boolean or a predicate function; failed() accepts
 * either a context object or a function returning one. The function forms are
 * evaluated lazily so expensive work stays inline with the assertion (and
 * strips from production along with it).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { should, failed } from '../assertions.js'

describe('should() / failed() callback forms', () => {
  let reportedResults: Record<string, unknown>[]

  beforeEach(() => {
    reportedResults = []
    vi.stubGlobal('window', {
      __scenetest_report: (result: Record<string, unknown>) => {
        reportedResults.push(result)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('should() with a predicate', () => {
    it('passes when the predicate returns truthy', () => {
      should('list is non-empty', () => [1, 2, 3].length > 0)

      expect(reportedResults).toHaveLength(1)
      expect(reportedResults[0].type).toBe('pass')
      expect(reportedResults[0].result).toBe(true)
    })

    it('fails when the predicate returns falsy', () => {
      should('list is non-empty', () => [].length > 0)

      expect(reportedResults[0].type).toBe('fail')
      expect(reportedResults[0].result).toBe(false)
    })

    it('coerces non-boolean return values to a boolean', () => {
      should('value present', () => 'hello' as unknown as boolean)

      expect(reportedResults[0].result).toBe(true)
    })

    it('only invokes the predicate once', () => {
      const predicate = vi.fn(() => true)
      should('runs once', predicate)

      expect(predicate).toHaveBeenCalledTimes(1)
    })

    it('passes the resolved context to the predicate', () => {
      should('all priced', (ctx) => (ctx!.items as number[]).every((p) => p > 0), {
        items: [1, 2, 3],
      })

      expect(reportedResults[0].type).toBe('pass')
    })

    it('reports a failure (not a throw) when the predicate throws', () => {
      expect(() =>
        should('throwing predicate', () => {
          throw new Error('boom')
        })
      ).not.toThrow()

      expect(reportedResults).toHaveLength(1)
      expect(reportedResults[0].type).toBe('fail')
      expect((reportedResults[0].context as Record<string, unknown>).error).toBe('boom')
    })
  })

  describe('should() with a boolean (unchanged behavior)', () => {
    it('still accepts a plain boolean condition', () => {
      should('plain true', true)
      should('plain false', false)

      expect(reportedResults[0].result).toBe(true)
      expect(reportedResults[1].result).toBe(false)
    })

    it('still attaches a plain context object', () => {
      should('with context', true, { userId: 42 })

      expect(reportedResults[0].context).toEqual({ userId: 42 })
    })
  })

  describe('lazy context', () => {
    it('should() evaluates a function context lazily', () => {
      const build = vi.fn(() => ({ snapshot: 'data' }))
      should('lazy ctx', true, build)

      expect(build).toHaveBeenCalledTimes(1)
      expect(reportedResults[0].context).toEqual({ snapshot: 'data' })
    })

    it('failed() evaluates a function context lazily', () => {
      const build = vi.fn(() => ({ reason: 'bad' }))
      failed('something broke', build)

      expect(build).toHaveBeenCalledTimes(1)
      expect(reportedResults[0].type).toBe('fail')
      expect(reportedResults[0].context).toEqual({ reason: 'bad' })
    })

    it('captures errors from a throwing context provider', () => {
      failed('broke', () => {
        throw new Error('ctx boom')
      })

      expect(reportedResults[0].context).toEqual({ contextError: 'ctx boom' })
    })
  })
})
