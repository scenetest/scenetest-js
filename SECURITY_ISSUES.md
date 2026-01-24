# Security Issues

This document contains security issues identified during a security review of scenetest-js. Each section can be used to create a GitHub issue.

---

## Issue 1: Document security boundaries for dev mode

**Labels:** security, documentation

### Summary
The project should clearly document that dev mode runs with full privileges and is not designed for untrusted code.

### Background
The security review identified that:
- User-provided assertion code is embedded directly into generated virtual modules (`packages/vite-plugin/src/virtual-module.ts:73-76`)
- This code executes via SSR without sandboxing (`packages/vite-plugin/src/middleware.ts:74`)

While this is acceptable for dev-only tooling, users should understand the security model.

### Recommended Changes
1. Add a "Security Considerations" section to README.md explaining:
   - Dev mode executes assertion code with full server privileges
   - Only run scenetest in development with trusted code
   - Production builds strip all test code (so no exposure in prod)

2. Add inline comments in virtual-module.ts warning about the security implications

---

## Issue 2: Add XSS security tests for assertion rendering

**Labels:** security, testing

### Summary
Add security-focused tests to verify that XSS attempts in assertion descriptions and contexts are properly escaped.

### Background
The dev panel renders assertion data using `innerHTML` with `escapeHtml()` for sanitization. While currently safe, this pattern could break if rendering functions are modified.

### Affected Files
- `packages/observer/src/render.ts`
- `packages/observer/src/fullscreen.ts`

### Recommended Tests
```typescript
// Test XSS attempts in assertion descriptions
should('<img src=x onerror="alert(1)">', true)
should('"><script>alert(1)</script>', true)

// Test XSS in context values
should('test', someValue, {
  context: '<img src=x onerror="alert(1)">'
})

// Test in assertion IDs
assert('<script>alert(1)</script>', async () => {}, () => ({}))
```

### Acceptance Criteria
- [ ] Add test file `packages/observer/test/security.test.ts`
- [ ] Verify all user-controlled content is properly escaped
- [ ] Test both small panel and fullscreen rendering paths

---

## Issue 3: Replace inline onclick handlers with addEventListener

**Labels:** security, refactor

### Summary
Refactor all inline `onclick` attributes to use `addEventListener()` for better security.

### Background
The codebase uses inline event handlers with string-built JavaScript:

```typescript
// packages/observer/src/fullscreen.ts:361-368
const backHandler = `window.opener ? window.opener.__scenetest_setViewMode...`
listEl.innerHTML = `<div class="back-btn" onclick="${backHandler}">...`

// packages/observer/src/render.ts:48
onclick="if(window.__scenetest_openInEditor)window.__scenetest_openInEditor(${locJson})"
```

This pattern is fragile - if any variable input gets embedded without proper escaping, it could lead to DOM-based XSS.

### Affected Files
- `packages/observer/src/fullscreen.ts` (lines 361, 368, and other onclick usages)
- `packages/observer/src/render.ts` (lines 22, 48, 99)

### Recommended Approach
Replace string-based HTML with DOM element creation:

```typescript
// Instead of:
listEl.innerHTML = `<div onclick="${handler}">Click</div>`

// Use:
const div = document.createElement('div')
div.textContent = 'Click'
div.addEventListener('click', () => {
  window.__scenetest_openInEditor?.(location)
})
listEl.appendChild(div)
```

Or use data attributes with a single delegated handler:
```typescript
elem.dataset.location = JSON.stringify(location)
container.addEventListener('click', (e) => {
  const loc = e.target.closest('[data-location]')?.dataset.location
  if (loc) window.__scenetest_openInEditor?.(JSON.parse(loc))
})
```

### Acceptance Criteria
- [ ] Remove all inline `onclick` attributes from render.ts
- [ ] Remove all inline `onclick` attributes from fullscreen.ts
- [ ] Use addEventListener or event delegation instead
- [ ] Verify functionality still works in dev panel

---

## Issue 4: Validate file paths before using in URI schemes

**Labels:** security, bug

### Summary
Add validation for file paths extracted from stack traces before using them in URI schemes like `vscode://`.

### Background
Two issues were identified:

#### 1. Missing URL encoding in vscode:// fallback
**File:** `packages/observer/src/utils.ts:52`

```typescript
fetch(`/__open-in-editor?file=${encodeURIComponent(loc.file)}...`)
  .catch(() => {
    // Fallback: vscode:// is NOT URL-encoded!
    window.open(`vscode://file${loc.file}:${loc.line}...`)
  })
```

#### 2. Weak stack trace parsing
**File:** `packages/scenetest/src/assertions.ts:37-50`

The regex-based stack trace parsing could potentially match spoofed patterns.

### Recommended Fixes

#### Fix 1: URL-encode the vscode fallback
```typescript
window.open(`vscode://file/${encodeURIComponent(loc.file)}:${loc.line}:${loc.column}`)
```

#### Fix 2: Validate parsed file paths
```typescript
function isValidFilePath(path: string): boolean {
  // Reject paths with protocols or traversal
  if (path.includes('://') || path.includes('..')) {
    return false
  }
  // Optionally: check path starts with expected project root
  return true
}

// In getCallerLocation():
if (match && isValidFilePath(match[1])) {
  return { file: match[1], line: ..., column: ... }
}
```

### Acceptance Criteria
- [ ] Add `encodeURIComponent()` to vscode:// URL in utils.ts
- [ ] Add path validation function in assertions.ts
- [ ] Reject paths containing `://` or `..`
- [ ] Add tests for edge cases

---

## Issue 5: Add Content Security Policy headers in dev mode

**Labels:** security, enhancement

### Summary
Consider adding Content Security Policy (CSP) headers in dev mode to provide defense-in-depth against code injection.

### Background
The dev panel injects scripts and styles into the page. While currently safe, adding CSP headers would provide an additional layer of protection against potential XSS vulnerabilities.

### Recommended Implementation
Add CSP headers via the Vite plugin's `configureServer` hook:

```typescript
// packages/vite-plugin/src/plugin.ts
configureServer(server) {
  server.middlewares.use((req, res, next) => {
    // Allow inline scripts/styles needed for dev panel
    // But restrict other potentially dangerous sources
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // Needed for dev panel
      "style-src 'self' 'unsafe-inline'",   // Needed for dev panel styles
      "object-src 'none'",                   // Prevent plugin-based attacks
      "base-uri 'self'",                     // Prevent base tag injection
    ].join('; '))
    next()
  })
}
```

### Considerations
- This should be optional/configurable as it may interfere with some apps
- May need adjustment based on what the host app requires
- Should only apply in dev mode (production builds don't include scenetest)

### Acceptance Criteria
- [ ] Add optional CSP middleware to Vite plugin
- [ ] Make it configurable via plugin options (default: off for compatibility)
- [ ] Document the option in README
- [ ] Test that dev panel still works with CSP enabled
