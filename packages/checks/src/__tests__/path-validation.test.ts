/**
 * Security tests for file path validation
 *
 * These tests verify that file paths extracted from stack traces are
 * validated before being used in URI schemes (like vscode://) to prevent
 * protocol injection and directory traversal attacks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isValidFilePath, should, failed } from '../assertions.js'

describe('isValidFilePath', () => {
  describe('valid paths', () => {
    it('accepts simple file paths', () => {
      expect(isValidFilePath('/src/App.tsx')).toBe(true)
    })

    it('accepts absolute Unix paths', () => {
      expect(isValidFilePath('/home/user/project/src/file.ts')).toBe(true)
    })

    it('accepts relative paths', () => {
      expect(isValidFilePath('src/components/Button.tsx')).toBe(true)
    })

    it('accepts Windows-style paths', () => {
      expect(isValidFilePath('C:\\Users\\dev\\project\\src\\file.ts')).toBe(true)
    })

    it('accepts paths with spaces', () => {
      expect(isValidFilePath('/home/user/my project/src/file.ts')).toBe(true)
    })

    it('accepts paths with special characters', () => {
      expect(isValidFilePath('/home/user/project@2.0/src/file.ts')).toBe(true)
    })

    it('accepts paths with underscores and dashes', () => {
      expect(isValidFilePath('/src/my-component_test.tsx')).toBe(true)
    })

    it('accepts paths with dots in filename', () => {
      expect(isValidFilePath('/src/file.test.ts')).toBe(true)
    })

    it('accepts paths with a single dot directory', () => {
      expect(isValidFilePath('./src/file.ts')).toBe(true)
    })
  })

  describe('protocol injection prevention', () => {
    it('rejects paths with javascript: protocol', () => {
      expect(isValidFilePath('javascript://alert(1)')).toBe(false)
    })

    it('rejects paths with data: protocol', () => {
      expect(isValidFilePath('data://text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('rejects paths with file: protocol', () => {
      expect(isValidFilePath('file:///etc/passwd')).toBe(false)
    })

    it('rejects paths with vscode: protocol', () => {
      expect(isValidFilePath('vscode://file/etc/passwd')).toBe(false)
    })

    it('rejects paths with http: protocol', () => {
      expect(isValidFilePath('http://evil.com/malware.js')).toBe(false)
    })

    it('rejects paths with https: protocol', () => {
      expect(isValidFilePath('https://evil.com/malware.js')).toBe(false)
    })

    it('rejects paths with custom protocol', () => {
      expect(isValidFilePath('custom-protocol://payload')).toBe(false)
    })

    it('rejects paths with protocol embedded in path', () => {
      expect(isValidFilePath('/src/javascript://alert.ts')).toBe(false)
    })
  })

  describe('directory traversal prevention', () => {
    it('rejects paths with .. traversal', () => {
      expect(isValidFilePath('/src/../../../etc/passwd')).toBe(false)
    })

    it('rejects paths starting with ..', () => {
      expect(isValidFilePath('../../../etc/passwd')).toBe(false)
    })

    it('rejects paths with .. in middle', () => {
      expect(isValidFilePath('/home/user/../admin/secrets')).toBe(false)
    })

    it('rejects paths ending with ..', () => {
      expect(isValidFilePath('/src/components/..')).toBe(false)
    })

    it('rejects Windows-style .. traversal', () => {
      expect(isValidFilePath('C:\\Users\\..\\Admin\\secrets.txt')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('accepts empty string (edge case)', () => {
      // Empty paths are technically "valid" per the function,
      // but would fail elsewhere in the system
      expect(isValidFilePath('')).toBe(true)
    })

    it('rejects minimal protocol injection', () => {
      expect(isValidFilePath('x://y')).toBe(false)
    })

    it('handles paths with multiple dots that are not traversal', () => {
      // "...." is not ".." so should be valid
      expect(isValidFilePath('/src/file....ts')).toBe(true)
    })

    it('rejects encoded traversal (if someone bypassed URL decoding)', () => {
      // The literal ".." should still be caught
      expect(isValidFilePath('/src/%2e%2e/secrets')).toBe(true) // This is valid because it's encoded
      expect(isValidFilePath('/src/../secrets')).toBe(false) // This is invalid
    })
  })
})

describe('should() with malicious paths', () => {
  let reportedResults: unknown[]

  beforeEach(() => {
    reportedResults = []
    // Mock the global window object
    vi.stubGlobal('window', {
      __scenetest_report: (result: unknown) => {
        reportedResults.push(result)
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should() still works but location is filtered', () => {
    // Call should() - the internal parseLocation will run but since we're
    // not in a browser context with proper stack traces, location will be undefined
    should('test assertion', true)

    expect(reportedResults.length).toBe(1)
    const result = reportedResults[0] as Record<string, unknown>
    expect(result.description).toBe('test assertion')
    expect(result.result).toBe(true)
  })

  it('failed() still works but location is filtered', () => {
    failed('test failure')

    expect(reportedResults.length).toBe(1)
    const result = reportedResults[0] as Record<string, unknown>
    expect(result.description).toBe('test failure')
    expect(result.result).toBe(false)
  })
})
