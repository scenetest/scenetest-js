import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// We import the transform logic by extracting it. Since the codemod is a
// standalone script, we re-implement the core here for testability.
// A cleaner approach would be to export processContent from the script,
// but for now we just inline-test the full script via a helper.

// ---------------------------------------------------------------------------
// Inline copy of core logic (mirrors codemod-see-to-scope.mjs)
// ---------------------------------------------------------------------------

function stripListPrefix(line) {
  return line.replace(/^(\s*)([-*]\s+|\d+\.\s+)/, '$1')
}

function parseAction(rawLine) {
  const stripped = stripListPrefix(rawLine).trim()
  const firstSpace = stripped.indexOf(' ')
  if (firstSpace === -1) return { action: stripped, rest: '' }
  return {
    action: stripped.slice(0, firstSpace),
    rest: stripped.slice(firstSpace + 1).trim(),
  }
}

function isActorCue(line) {
  const trimmed = line.trim()
  if (/^(cleanup|setup|if)\s*:/.test(trimmed)) return false
  return /^[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(trimmed)
}

function isHeading(line) {
  return /^\s*#{1,6}\s/.test(line)
}

function isSkippable(line) {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.startsWith('#')) return true
  if (/^(cleanup|setup)\s*:/.test(trimmed)) return true
  return false
}

function isScopeDependent(action, rest) {
  if (action === 'typeInto' || action === 'check' || action === 'select') return true
  if (action === 'click' && !rest) return true
  if (action === 'prev') return true
  if (action === 'up' && rest) return true
  if (action === 'scope') return true
  return false
}

function isScopeResetting(action, rest) {
  if (action === 'openTo' || action === 'reload' || action === 'goBack' ||
      action === 'goForward' || action === 'switchDevice') return true
  if (action === 'up' && !rest) return true
  return false
}

function processContent(content) {
  const lines = content.split('\n')
  const toConvert = new Set()
  let pendingSees = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isHeading(line) || isActorCue(line)) {
      pendingSees = []
      continue
    }
    if (isSkippable(line)) continue
    const { action, rest } = parseAction(line)
    if (action === 'see' && rest) {
      pendingSees.push(i)
    } else if (isScopeDependent(action, rest)) {
      for (const idx of pendingSees) toConvert.add(idx)
    } else if (isScopeResetting(action, rest)) {
      pendingSees = []
    }
  }

  if (toConvert.size === 0) return null

  const newLines = lines.map((line, i) => {
    if (!toConvert.has(i)) return line
    return line.replace(/\bsee\b/, 'scope')
  })

  return { newContent: newLines.join('\n'), converted: [...toConvert].sort((a, b) => a - b) }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('codemod-see-to-scope', () => {
  it('converts see before typeInto', () => {
    const input = `user:
- see login-form
- typeInto email hello`
    const result = processContent(input)
    expect(result).not.toBeNull()
    expect(result.newContent).toContain('- scope login-form')
    expect(result.newContent).toContain('- typeInto email hello')
  })

  it('converts see before check', () => {
    const input = `user:
- see settings
- check dark-mode`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope settings')
  })

  it('converts see before select', () => {
    const input = `user:
- see form
- select language spanish`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope form')
  })

  it('converts see before bare click', () => {
    const input = `user:
- see notification-badge
- click`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope notification-badge')
  })

  it('converts see before prev', () => {
    const input = `user:
- see modal
- see form
- prev`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope modal')
    expect(result.newContent).toContain('- scope form')
  })

  it('converts see before up with selector', () => {
    const input = `user:
- see nested-item
- up ~container`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope nested-item')
  })

  it('converts see before scope (nested narrowing)', () => {
    const input = `user:
- see sidebar
- scope search-section
- typeInto input hello`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope sidebar')
  })

  it('does NOT convert see that is just an assertion', () => {
    const input = `user:
- see dashboard
- see welcome-banner
- click logout-button`
    const result = processContent(input)
    // click has a selector, so it's not scope-dependent
    expect(result).toBeNull()
  })

  it('does NOT convert see before click with selector', () => {
    const input = `user:
- see modal
- click close-button`
    const result = processContent(input)
    expect(result).toBeNull()
  })

  it('does NOT convert see before openTo (scope reset)', () => {
    const input = `user:
- see sidebar
- openTo /other
- typeInto search hello`
    const result = processContent(input)
    // see sidebar is cleared by openTo, typeInto has no pending see
    expect(result).toBeNull()
  })

  it('does NOT convert see before bare up (scope reset)', () => {
    const input = `user:
- see sidebar
- up
- typeInto search hello`
    const result = processContent(input)
    expect(result).toBeNull()
  })

  it('clears pending sees at actor boundary', () => {
    const input = `alice:
- see sidebar
bob:
- typeInto search hello`
    const result = processContent(input)
    expect(result).toBeNull()
  })

  it('clears pending sees at scene boundary', () => {
    const input = `## scene one
user:
- see sidebar

## scene two
user:
- typeInto search hello`
    const result = processContent(input)
    expect(result).toBeNull()
  })

  it('converts nested sees when followed by form interaction', () => {
    const input = `user:
- see sidebar
- see search-section
- typeInto input hello`
    const result = processContent(input)
    expect(result.newContent).toContain('- scope sidebar')
    expect(result.newContent).toContain('- scope search-section')
  })

  it('preserves see after scope reset even if later action is scope-dependent', () => {
    const input = `user:
- see header
- openTo /settings
- see form
- typeInto name Alice`
    const result = processContent(input)
    // header should NOT be converted (cleared by openTo)
    // form SHOULD be converted (before typeInto)
    expect(result.newContent).toContain('- see header')
    expect(result.newContent).toContain('- scope form')
  })

  it('does not touch seeText, seeInView, seeToast, notSee', () => {
    const input = `user:
- seeText hello
- seeInView banner
- seeToast notification
- notSee error
- typeInto input value`
    const result = processContent(input)
    expect(result).toBeNull()
  })

  it('handles list prefix variations', () => {
    const input = `user:
1. see form
2. typeInto email hello`
    const result = processContent(input)
    expect(result.newContent).toContain('1. scope form')
  })

  it('returns null when no conversions needed', () => {
    const input = `user:
- openTo /home
- see dashboard
- seeText Welcome`
    const result = processContent(input)
    expect(result).toBeNull()
  })
})
