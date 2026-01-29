/**
 * Security tests for XSS prevention in assertion rendering
 *
 * These tests verify that user-controlled content is properly escaped
 * when rendered in the dev panel to prevent XSS attacks.
 *
 * Key security property: All `<` and `>` characters in user content
 * must be escaped to `&lt;` and `&gt;` so the browser won't parse
 * them as HTML tags.
 */

import { describe, it, expect } from 'vitest'
import { escapeHtml, formatContext, formatLocation } from '../utils.js'
import {
  renderPanelItem,
  renderPanelItemWithTime,
  renderFullscreenItem,
  renderFullscreenGroup,
  renderLocationRow,
  renderPianoRoll,
  renderSequenceEntry,
  renderSequenceHeader
} from '../render.js'
import type { AssertionResult, AssertionGroup, LocationGroup, LocationEntry } from '../types.js'

// Common XSS attack vectors to test
const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror="alert(1)">',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<svg onload="alert(1)">',
  '<body onload="alert(1)">',
  '<iframe src="javascript:alert(1)">',
  '<a href="javascript:alert(1)">click</a>',
  '<div onclick="alert(1)">click</div>',
  '{{constructor.constructor("alert(1)")()}}',
  '<math><maction xlink:href="javascript:alert(1)">click',
  '<input onfocus="alert(1)" autofocus>',
  '<marquee onstart="alert(1)">',
  '<details open ontoggle="alert(1)">',
  '<embed src="javascript:alert(1)">',
]

// HTML entities that must be escaped
const HTML_ENTITIES = [
  { input: '<', expected: '&lt;' },
  { input: '>', expected: '&gt;' },
  { input: '&', expected: '&amp;' },
  { input: '<script>', expected: '&lt;script&gt;' },
  { input: 'a < b && b > c', expected: 'a &lt; b &amp;&amp; b &gt; c' },
]

describe('escapeHtml', () => {
  it('escapes < character', () => {
    expect(escapeHtml('<')).toBe('&lt;')
  })

  it('escapes > character', () => {
    expect(escapeHtml('>')).toBe('&gt;')
  })

  it('escapes & character', () => {
    expect(escapeHtml('&')).toBe('&amp;')
  })

  it('escapes multiple occurrences', () => {
    expect(escapeHtml('<script>alert("&")</script>')).toBe('&lt;script&gt;alert("&amp;")&lt;/script&gt;')
  })

  it.each(HTML_ENTITIES)('escapes "$input" to "$expected"', ({ input, expected }) => {
    expect(escapeHtml(input)).toBe(expected)
  })

  it.each(XSS_PAYLOADS)('neutralizes XSS payload by escaping angle brackets: %s', (payload) => {
    const escaped = escapeHtml(payload)

    // Key security property: < and > must be escaped
    // This prevents the browser from parsing content as HTML tags
    if (payload.includes('<')) {
      expect(escaped).toContain('&lt;')
      expect(escaped).not.toContain('<')
    }
    if (payload.includes('>')) {
      expect(escaped).toContain('&gt;')
      expect(escaped).not.toContain('>')
    }
  })

  it('should not allow unescaped < character', () => {
    const dangerous = '<script>alert(1)</script>'
    const escaped = escapeHtml(dangerous)
    // After escaping, no raw < should remain
    expect(escaped.includes('<')).toBe(false)
  })
})

describe('formatContext', () => {
  it('returns empty string for undefined', () => {
    expect(formatContext(undefined)).toBe('')
  })

  it('handles simple objects', () => {
    expect(formatContext({ key: 'value' })).toBe('{\n  "key": "value"\n}')
  })

  it('handles objects with XSS in values (JSON escapes properly)', () => {
    const ctx = { payload: '<script>alert(1)</script>' }
    const result = formatContext(ctx)
    // JSON.stringify doesn't escape < > but that's OK - escapeHtml is called on the result
    expect(result).toContain('<script>')
  })
})

describe('formatLocation', () => {
  it('returns empty string for undefined', () => {
    expect(formatLocation(undefined)).toBe('')
  })

  it('formats location correctly', () => {
    const loc = { file: '/path/to/src/file.ts', line: 42, column: 10 }
    expect(formatLocation(loc)).toBe('src/file.ts:42:10')
  })
})

// Helper to create test assertion
function createAssertion(overrides: Partial<AssertionResult> = {}): AssertionResult {
  return {
    type: 'pass',
    description: 'test assertion',
    result: true,
    timestamp: Date.now(),
    ...overrides
  }
}

// Helper to create test group
function createGroup(items: AssertionResult[], overrides: Partial<AssertionGroup> = {}): AssertionGroup {
  return {
    id: 1,
    timestamp: Date.now(),
    items,
    collapsed: false,
    ...overrides
  }
}

// Helper to create location group
function createLocationGroup(overrides: Partial<LocationGroup> = {}): LocationGroup {
  return {
    key: 'file.ts:10',
    location: { file: '/path/file.ts', line: 10 },
    description: 'test',
    entries: [{ result: true, timestamp: Date.now(), index: 0, description: 'test' }],
    lastResult: true,
    lastTimestamp: Date.now(),
    ...overrides
  }
}

/**
 * Test that when the payload appears in the output as content (not as part
 * of the template structure), it has < and > escaped.
 */
function assertContentEscaped(html: string, payload: string): void {
  // If payload has <, the HTML should not contain the literal payload
  // (it should have &lt; instead of <)
  if (payload.includes('<')) {
    // The literal unescaped payload should not appear
    expect(html).not.toContain(payload)
    // Instead, the escaped version should appear
    const escapedPayload = payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    expect(html).toContain(escapedPayload)
  }
}

describe('renderPanelItem - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in description: %s', (payload) => {
    const assertion = createAssertion({ description: payload })
    const html = renderPanelItem(assertion, 1)

    assertContentEscaped(html, payload)
  })

  it.each(XSS_PAYLOADS)('escapes XSS in location file path: %s', (payload) => {
    const assertion = createAssertion({
      location: { file: payload, line: 1 }
    })
    const html = renderPanelItem(assertion, 1)

    // Location file path should be escaped
    if (payload.includes('<')) {
      expect(html).not.toContain(`>${payload}<`)
    }
  })

  it.each(XSS_PAYLOADS)('escapes XSS in context tooltip: %s', (payload) => {
    const assertion = createAssertion({
      context: { malicious: payload }
    })
    const html = renderPanelItem(assertion, 1)

    // The title attribute content should be escaped
    // The context goes through formatContext (JSON) then escapeHtml
    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })
})

describe('renderPanelItemWithTime - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in description: %s', (payload) => {
    const assertion = createAssertion({ description: payload, _index: 0 })
    const html = renderPanelItemWithTime(assertion)

    assertContentEscaped(html, payload)
  })
})

describe('renderFullscreenItem - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in description: %s', (payload) => {
    const assertion = createAssertion({ description: payload, _index: 0 })
    const html = renderFullscreenItem(assertion)

    assertContentEscaped(html, payload)
  })

  it.each(XSS_PAYLOADS)('escapes XSS in context: %s', (payload) => {
    const assertion = createAssertion({
      context: { attack: payload },
      _index: 0
    })
    const html = renderFullscreenItem(assertion)

    // Context is JSON stringified then escaped
    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })

  it.each(XSS_PAYLOADS)('escapes XSS in stack trace: %s', (payload) => {
    const assertion = createAssertion({
      stack: `Error: ${payload}\n    at test.js:1:1`,
      _index: 0
    })
    const html = renderFullscreenItem(assertion)

    // Stack is escaped
    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })

  it.each(XSS_PAYLOADS)('escapes XSS in location: %s', (payload) => {
    const assertion = createAssertion({
      location: { file: payload, line: 1 },
      _index: 0
    })
    const html = renderFullscreenItem(assertion)

    // Location is escaped (note: location is also JSON stringified for onclick)
    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })
})

describe('renderFullscreenGroup - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in all group items: %s', (payload) => {
    const group = createGroup([
      createAssertion({ description: payload, _index: 0 }),
      createAssertion({ description: `normal text ${payload}`, _index: 1 })
    ])
    const html = renderFullscreenGroup(group)

    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
      expect(html).not.toContain(`<div class="desc">${payload}`)
    }
  })
})

describe('renderLocationRow - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in description: %s', (payload) => {
    const group = createLocationGroup({ description: payload })
    const html = renderLocationRow(group)

    assertContentEscaped(html, payload)
  })

  it.each(XSS_PAYLOADS)('escapes XSS in location file: %s', (payload) => {
    const group = createLocationGroup({
      location: { file: payload, line: 1 }
    })
    const html = renderLocationRow(group)

    // formatLocationShort just gets the basename, which is still escaped
    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })
})

describe('renderSequenceEntry - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in description: %s', (payload) => {
    const entry: LocationEntry = {
      result: true,
      timestamp: Date.now(),
      index: 0,
      description: payload
    }
    const html = renderSequenceEntry(entry, { file: 'test.ts', line: 1 })

    assertContentEscaped(html, payload)
  })

  it.each(XSS_PAYLOADS)('escapes XSS in context: %s', (payload) => {
    const entry: LocationEntry = {
      result: true,
      timestamp: Date.now(),
      index: 0,
      description: 'test',
      context: { evil: payload }
    }
    const html = renderSequenceEntry(entry, { file: 'test.ts', line: 1 })

    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })
})

describe('renderSequenceHeader - XSS prevention', () => {
  it.each(XSS_PAYLOADS)('escapes XSS in location file: %s', (payload) => {
    const group = createLocationGroup({
      location: { file: payload, line: 1 }
    })
    const html = renderSequenceHeader(group)

    if (payload.includes('<')) {
      expect(html).toContain('&lt;')
    }
  })
})

describe('renderPianoRoll - data-chords attribute', () => {
  it('escapes quotes in chord JSON so the attribute is not truncated', () => {
    const locations: LocationGroup[] = [
      createLocationGroup({ description: 'assertion one' }),
      createLocationGroup({ description: 'assertion two' }),
    ]
    const now = Date.now()
    const assertions: AssertionResult[] = [
      createAssertion({ description: 'assertion one', timestamp: now }),
      createAssertion({ description: 'assertion two', timestamp: now }),
    ]
    const html = renderPianoRoll(locations, assertions)

    // The data-chords attribute must use &quot; for quotes so that the
    // JSON is not truncated by the HTML attribute boundary
    const match = html.match(/data-chords="([^"]*)"/)
    expect(match).toBeTruthy()

    // The captured attribute value should contain &quot; (escaped quotes)
    // rather than raw " which would break the attribute
    const attrValue = match![1]
    expect(attrValue).toContain('&quot;')

    // After unescaping HTML entities (simulating what the browser does),
    // the result should be valid JSON
    const unescaped = attrValue
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
    const parsed = JSON.parse(unescaped)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(1) // both assertions grouped into one chord
    expect(parsed[0].notes).toHaveLength(2)
    expect(parsed[0].notes[0].description).toBe('assertion one')
    expect(parsed[0].notes[1].description).toBe('assertion two')
  })

  it('handles XSS payloads in assertion descriptions within chord data', () => {
    const payload = '"><img src=x onerror=alert(1)>'
    const locations: LocationGroup[] = [
      createLocationGroup({ description: payload }),
    ]
    const assertions: AssertionResult[] = [
      createAssertion({ description: payload, timestamp: Date.now() }),
    ]
    const html = renderPianoRoll(locations, assertions)

    // The raw payload must not appear unescaped in the attribute
    expect(html).not.toContain(`data-chords="${payload}`)
    expect(html).not.toContain('<img src=x')

    // Should still produce parseable chord data
    const match = html.match(/data-chords="([^"]*)"/)
    expect(match).toBeTruthy()
    const unescaped = match![1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
    const parsed = JSON.parse(unescaped)
    expect(parsed[0].notes[0].description).toBe(payload)
  })
})

describe('JSON in data attributes', () => {
  it('properly handles quotes in location JSON', () => {
    // Test that file paths with quotes are properly handled
    const assertion = createAssertion({
      location: { file: '/path/with"quote/file.ts', line: 1 },
      _index: 0
    })
    const html = renderPanelItemWithTime(assertion)

    // The JSON should be escaped for the attribute context
    expect(html).toContain('&quot;')
  })

  it('JSON.stringify escapes special characters in location data', () => {
    const assertion = createAssertion({
      location: { file: '/path/with<angle>brackets/file.ts', line: 1 },
      _index: 0
    })
    const html = renderFullscreenItem(assertion)

    // The location path should have < > escaped
    expect(html).toContain('&lt;angle&gt;')
  })
})

describe('edge cases', () => {
  it('handles empty description', () => {
    const assertion = createAssertion({ description: '' })
    const html = renderPanelItem(assertion, 1)
    expect(html).toBeDefined()
    expect(html).toContain('scenetest-desc')
  })

  it('handles very long malicious strings', () => {
    const longPayload = '<script>'.repeat(100) + 'alert(1)' + '</script>'.repeat(100)
    const assertion = createAssertion({ description: longPayload })
    const html = renderPanelItem(assertion, 1)

    // Should contain escaped version
    expect(html).toContain('&lt;script&gt;')
    // Should not contain unescaped version
    expect(html).not.toContain('<script>')
  })

  it('handles unicode and emoji in descriptions', () => {
    const assertion = createAssertion({ description: '✅ Test passed 🎉 <script>alert(1)</script>' })
    const html = renderPanelItem(assertion, 1)

    expect(html).toContain('✅')
    expect(html).toContain('🎉')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('handles null bytes and control characters', () => {
    const assertion = createAssertion({ description: 'test\x00<script>alert(1)</script>' })
    const html = renderPanelItem(assertion, 1)

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('handles nested object context with XSS', () => {
    const assertion = createAssertion({
      context: {
        level1: {
          level2: {
            attack: '<script>alert(1)</script>'
          }
        }
      },
      _index: 0
    })
    const html = renderFullscreenItem(assertion)

    // The context is JSON stringified, then HTML escaped
    expect(html).toContain('&lt;script&gt;')
  })

  it('handles ampersands to prevent entity injection', () => {
    // An attacker might try to use &lt; literally to bypass escaping
    const assertion = createAssertion({ description: '&lt;script&gt;alert(1)&lt;/script&gt;' })
    const html = renderPanelItem(assertion, 1)

    // The & should be escaped to &amp;, so the output is safe
    expect(html).toContain('&amp;lt;')
  })
})

describe('attribute injection prevention', () => {
  it('group id is a number, not injectable', () => {
    const group = createGroup([createAssertion()], { id: 123 })
    const html = renderFullscreenGroup(group)

    // data-group-id should contain just the number
    expect(html).toContain('data-group-id="123"')
  })

  it('prevents breaking out of title attribute', () => {
    // Try to break out of title="..." with a quote
    const assertion = createAssertion({
      context: { evil: '" onclick="alert(1)' }
    })
    const html = renderPanelItem(assertion, 1)

    // The quote should be part of the escaped JSON, not breaking out
    // Note: the context goes through JSON.stringify which escapes quotes
    expect(html).not.toMatch(/title="[^"]*"\s+onclick/)
  })
})
