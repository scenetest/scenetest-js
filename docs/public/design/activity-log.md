# Activity Log for Bug Reports

**STATUS: Conceptual** - Ideas captured, waiting for more experience with recorder before implementation.

---

## Vision

When a user encounters a bug in production, they can submit a bug report that includes a human-readable log of their recent actions - like a stack trace, but for user interactions. The DSL format makes these logs reviewable by users (for privacy) and actionable by developers (for reproduction).

```
User hits bug → Activity log captured → User reviews & submits
                                              ↓
                        ┌─────────────────────────────────────┐
                        │  Intermediate Interface             │
                        │  - Match to existing test specs?    │
                        │  - Run with test data               │
                        │  - Invent new team roles if needed  │
                        └─────────────────────────────────────┘
                                              ↓
                              Reproducible test case (or not)
```

## The Production / Test Split

Key architectural constraint: what ships to production vs. what's test-only.

```
┌─────────────────────────────────────────────────────────────────┐
│  SHIPS TO PRODUCTION                                            │
├─────────────────────────────────────────────────────────────────┤
│  should(), failed()     → lightweight, feed activity log        │
│  activity-log collector → reports to "open issue" endpoint      │
│  recorder capture logic → shared code, but bundled differently  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  TEST-ONLY (stripped in prod)                                   │
├─────────────────────────────────────────────────────────────────┤
│  assert()               → server-side assertions                │
│  test collector         → reports to test server                │
│  scene()/test() DSL     → orchestration                         │
└─────────────────────────────────────────────────────────────────┘
```

The activity log collector is a different thing from the test collector - it reports to a bug tracking endpoint, not a test server. But it likely shares types and capture logic with the recorder package.

## User Experience

### Triggering the Report

Options (not mutually exclusive):
- Automatic prompt on crash/error boundary
- Manual "Report a bug" button in app
- Keyboard shortcut (Cmd+Shift+B?)

### The Review Modal

```markdown
## Bug Report: Application crashed unexpectedly

### Activity Log (last 10 actions)
- openTo /dashboard
- see user-profile           ✓ loaded
- click settings-button
- see settings-modal         ✓ modal appeared
- typeInto email ████████    ← auto-masked
- click save-button
- see loading-spinner
- see error-toast            ✗ "Save failed"
- click retry-button
- [crash]

### Failed Assertions
1. "user settings should save successfully" - FAILED
   at src/components/Settings.tsx:42

### Console Errors
- TypeError: Cannot read property 'email' of undefined

---
☐ I've reviewed this log and confirm no personal info remains
[Submit Bug Report]  [Cancel]
```

Users must review and confirm before submission. We auto-mask passwords but flag other potential PII for their review.

## Privacy Sanitization

### Auto-masking

```typescript
const SENSITIVE_SELECTORS = ['password', 'secret', 'token', 'api-key', 'credit-card']

// typeInto password hunter2  →  typeInto password ████████
```

### Flagging for Review

Pattern-match potential PII and highlight it in the review UI:
- Email addresses
- Phone numbers
- Credit card patterns
- SSNs
- Custom patterns per-app

User sees flagged items highlighted and can edit/redact before submission.

## Parameterization

Instead of capturing raw values, capture *roles* that map to your team system:

```markdown
# Raw capture (privacy risk, not replayable)
- typeInto email john.smith@gmail.com
- typeInto friend-invite sarah@example.com

# Parameterized capture (safe + replayable)
- typeInto email [user.email]
- typeInto friend-invite [a-friend-from-irl.email]
```

### Role Selection UX

When reviewing the report, user can:
1. Accept auto-detected role (`[user.email]` for their own email)
2. Pick from suggested roles (`a-friend-from-irl`, `coworker`, `stranger`)
3. Define a new role if none fit

This makes the bug report directly convertible to a test spec.

## The Intermediate Interface

A service/UI that receives bug reports and tries to make them actionable:

### 1. Match to Existing Specs

```
Incoming report:
- openTo /checkout
- typeInto promo-code SAVE20
- click apply-button
- see error "Invalid code"

Existing spec found: checkout-promo-codes.scene.ts
  - Has test for valid codes, but not invalid codes
  - Suggested: Add test case for invalid promo code handling
```

### 2. Replay with Test Data

Try to reproduce the issue using existing team fixtures:

```typescript
// Bug report used [user.email] = "john@gmail.com"
// We replay with test user: team.user.email = "test@example.com"

// If reproduction succeeds → confirmed bug
// If reproduction fails → environment-specific or data-dependent
```

### 3. Invent New Roles

If the bug involves an interaction pattern we don't have fixtures for:

```
Report involves: [a-friend-from-irl.email]
No existing role matches this pattern.

Suggested new team role:
  friend: {
    relationship: 'irl',
    email: 'friend@test.com',
    // ... inferred from report context
  }
```

## Shared Code with Recorder

The activity log will share significant code with `packages/recorder/`:

| Component | Recorder | Activity Log |
|-----------|----------|--------------|
| DOM event capture | ✓ | ✓ (same code) |
| Selector reversal | ✓ | ✓ (same code) |
| DSL formatting | ✓ | ✓ (same code) |
| Assertion linking | ✓ | ✓ (same code) |
| Build target | Dev only | Production |
| Bundle size | Not critical | Must be small |
| Storage | Unbounded | Ring buffer |

Likely approach: shared source in a `-core` package, different build configurations for recorder (dev) vs activity-log (prod).

## Ring Buffer Storage

Production activity log uses a fixed-size ring buffer:

```typescript
class ActivityRingBuffer {
  private buffer: DslLine[] = []
  private maxSize = 50  // configurable

  push(entry: DslLine) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift()
    }
    this.buffer.push(entry)
  }

  getRecent(n: number): DslLine[] {
    return this.buffer.slice(-n)
  }
}
```

Memory-bounded, no persistence, lost on page refresh (by design for privacy).

## API Sketch

```typescript
import { activityLog } from 'scenetest/activity-log'

// Configure on app init
activityLog.init({
  maxEntries: 50,
  autoMask: ['password', 'ssn', 'credit-card'],
  flagPatterns: [/\b\d{3}-\d{2}-\d{4}\b/],  // SSN pattern
  submitEndpoint: '/api/bug-reports',
})

// Trigger report (e.g., from error boundary)
activityLog.promptBugReport({
  reason: 'Application crashed unexpectedly',
  error: caughtError,
  includeAssertions: true,
  includeConsoleErrors: true,
})

// Or get raw data for custom UI
const report = activityLog.generateReport({
  lastN: 10,
  includeAssertions: true,
})
```

## Integration with should()/failed()

The production-safe assertions feed into the activity log:

```typescript
// In production, these are lightweight and feed the activity log
should('user profile loads', !!user)
failed('API returned error', error.message)

// Activity log captures:
// - see user-profile  ✓ "user profile loads"
// - [api error]       ✗ "API returned error: 500 Internal Server Error"
```

The `assert()` function and full test collector are stripped in production builds.

## Open Questions

1. **Package structure**: New `scenetest-activity-log` package? Or mode within existing packages?

2. **Build configuration**: How to share source with recorder but produce different bundles?

3. **Submission endpoint**: What's the default? GitHub Issues API? Custom webhook? Both?

4. **Screenshot capture**: Include canvas snapshot before crash? Privacy implications?

5. **Session replay integration**: Could this feed into tools like LogRocket/FullStory? Or replace them?

6. **Offline support**: Queue reports when offline, submit when back online?

## Dependencies

Before implementing:
- [ ] More experience with recorder package to understand shared patterns
- [ ] Finalize what `should()`/`failed()` do in production builds
- [ ] Design the intermediate interface for report → test spec matching

## Related Docs

- `dashboard.md` - Report storage and viewing (different concern, but related)
- `server-actions.md` - The `assert()` system that does NOT ship to production
- `cli-v2.md` - Team/actor system that parameterized reports would map to
