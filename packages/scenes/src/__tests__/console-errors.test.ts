import { describe, it, expect } from 'vitest'
import {
  consoleErrorMatches,
  claimConsoleError,
  waitForConsoleError,
  parseConsoleErrorPattern,
  describeMissingConsoleError,
} from '../console-errors.js'
import type { ConsoleError } from '../types.js'

function err(partial: Partial<ConsoleError> & { message: string }): ConsoleError {
  return {
    actor: 'learner',
    timestamp: 0,
    type: 'error',
    source: 'console',
    ...partial,
  }
}

describe('consoleErrorMatches', () => {
  it('matches strings as case-insensitive substrings', () => {
    expect(consoleErrorMatches('Invalid login credentials', 'invalid LOGIN')).toBe(true)
    expect(consoleErrorMatches('all good', 'invalid')).toBe(false)
  })

  it('matches RegExp patterns as given', () => {
    expect(consoleErrorMatches('status of 400 (Bad Request)', /status of 4\d\d/)).toBe(true)
    expect(consoleErrorMatches('status of 200', /status of 4\d\d/)).toBe(false)
  })
})

describe('claimConsoleError', () => {
  it('claims the earliest unclaimed matching error for the actor', () => {
    const errors = [
      err({ message: 'status of 400', timestamp: 20 }),
      err({ message: 'status of 400', timestamp: 10 }),
    ]
    const claimed = claimConsoleError(errors, 'learner', '400')
    expect(claimed?.timestamp).toBe(10)
    expect(errors[1].expected).toBe(true)
    expect(errors[0].expected).toBeUndefined()
  })

  it('claims only one error per call (first match only)', () => {
    const errors = [
      err({ message: 'status of 400', timestamp: 10 }),
      err({ message: 'status of 400', timestamp: 20 }),
    ]
    claimConsoleError(errors, 'learner', '400')
    const second = claimConsoleError(errors, 'learner', '400')
    expect(second?.timestamp).toBe(20)
    expect(errors.every((e) => e.expected)).toBe(true)
  })

  it('does not claim errors from a different actor', () => {
    const errors = [err({ message: 'status of 400', actor: 'teacher' })]
    expect(claimConsoleError(errors, 'learner', '400')).toBeNull()
    expect(errors[0].expected).toBeUndefined()
  })

  it('returns null when nothing matches', () => {
    const errors = [err({ message: 'all good' })]
    expect(claimConsoleError(errors, 'learner', '400')).toBeNull()
  })
})

describe('waitForConsoleError', () => {
  it('resolves once a matching error arrives in the shared buffer', async () => {
    const errors: ConsoleError[] = []
    const pending = waitForConsoleError(errors, 'learner', 'Invalid login', 1000, 5)
    setTimeout(() => errors.push(err({ message: 'Invalid login credentials' })), 15)
    const claimed = await pending
    expect(claimed?.message).toBe('Invalid login credentials')
    expect(errors[0].expected).toBe(true)
  })

  it('resolves null when no matching error arrives before the timeout', async () => {
    const errors: ConsoleError[] = [err({ message: 'unrelated' })]
    const claimed = await waitForConsoleError(errors, 'learner', '400', 30, 5)
    expect(claimed).toBeNull()
  })
})

describe('parseConsoleErrorPattern', () => {
  it('returns a literal string for plain text', () => {
    expect(parseConsoleErrorPattern('Invalid login credentials')).toBe('Invalid login credentials')
  })

  it('parses /pattern/flags into a RegExp', () => {
    const p = parseConsoleErrorPattern('/status of 4\\d\\d/i')
    expect(p).toBeInstanceOf(RegExp)
    expect((p as RegExp).source).toBe('status of 4\\d\\d')
    expect((p as RegExp).flags).toBe('i')
  })

  it('falls back to a literal when the regex body is invalid', () => {
    expect(parseConsoleErrorPattern('/(/')).toBe('/(/')
  })
})

describe('describeMissingConsoleError', () => {
  it('lists the unclaimed errors actually seen for the actor', () => {
    const errors = [
      err({ message: 'something else happened' }),
      err({ message: 'claimed already', expected: true }),
    ]
    const msg = describeMissingConsoleError(errors, 'learner', '400', 5000)
    expect(msg).toContain('no console error matching "400"')
    expect(msg).toContain('something else happened')
    expect(msg).not.toContain('claimed already')
  })

  it('notes when nothing was captured', () => {
    const msg = describeMissingConsoleError([], 'learner', /4\d\d/, 5000)
    expect(msg).toContain('No unclaimed console errors were captured')
  })
})
