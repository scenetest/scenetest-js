# Scenecheck CLI v2 Design Document

**STATUS: Partial Implementation** - Core features implemented, future sections in design.

---

This document captures the design for the next evolution of the scenecheck CLI, including implemented features and future considerations.

## 1. Philosophy

### Core Principles

- **User journey testing, not implementation testing** - Test what users see and do, not internal API calls
- **Accessibility-first selector resolution** - Encourage good accessibility by making aria attributes primary selectors
- **Concurrent scenes as data** - Scenes can be expressed as text arrays, inline DSL strings, or plain markdown files
- **Observable but non-blocking warnings** - Script-level warnings (`warnIf`) don't fail tests but surface unexpected paths

### What Scenecheck Is NOT

- Not a unit testing framework
- Not for testing API implementations directly
- Not for asserting "this API was called with these parameters"

## 2. Text DSL (Implemented)

Scenes can be expressed as arrays of strings, making them readable by non-engineers and serializable:

```typescript
const checkoutFlow = [
  'openTo /cart',
  'see cart-items',
  'click checkout-button',
  'see payment-form',
  'typeInto card-number 4242424242424242',
  'click submit',
  'seeToast success-toast',
]

await runDsl(user, checkoutFlow)
```

### Macros

Named, reusable action sequences with variable substitution:

```typescript
defineMacro('login', [
  'see login-form',
  'typeInto username {{username}}',
  'typeInto password {{password}}',
  'click submit-button',
  'see dashboard',
])

await runMacro(user, 'login', { username: 'alice', password: 'secret' })
```

For the full text DSL grammar, `.spec.md` markdown scene format, and complete syntax reference, see [Text DSL Reference](/reference/text-dsl).

## 3. Selector Resolution (Implemented)

For selector priority order, nested selectors, implicit key matching, sigil prefixes, and alias configuration, see [Selector Reference](/reference/selectors).

## 4. Chaining Model (Implemented)

### Scope Propagation

`see()` updates the current scope. Subsequent actions operate within that scope:

```typescript
await user
  .see('playlist-row 12345')   // Scope → this playlist row (key matched on same element)
  .click('like-button')        // Click within that row
  .see('liked-indicator')      // Verify within that row
```

### Navigation Methods

- `up(selector)` - Navigate to an ancestor matching the selector
- `prev()` - Return to the previous scope

```typescript
await user
  .see('modal')
  .see('form')
  .typeInto('name', 'Test')
  .prev()              // Back to modal scope
  .click('close')      // Click modal's close button
```

## 5. Off-Script Warnings (Implemented)

`warnIf()` registers a warning trigger for unexpected paths in your test script. If the selector appears during subsequent actions, a warning is recorded but the test continues.

```typescript
// This user should have dismissed the welcome modal
user.warnIf('welcome-modal', 'user should have dismiss flag set')
await user.openTo('/dashboard')
```

### Characteristics

- **Not an assertion** - Doesn't indicate app failure, indicates script reached unexpected place
- **Persists for entire scene** - Unlike `if()` watchers which clear after each await
- **Reported separately** - Shows in `SceneReport.warnings`, not `assertions`
- **Context captured** - Records selector, message, timestamp, actor, and which action was running

### Use Cases

- Deprecation tracking: "This code path still runs? We thought we migrated everyone"
- Tech debt markers: "Fallback triggered - should investigate"
- Flaky test debugging: "Sometimes we see this modal, sometimes not"
- A/B test monitoring: "User hit control group unexpectedly"

### Output

Warnings show in the summary:
```
⚡ 2 script warning(s)
  └─ [user] welcome-modal: user should have dismiss flag set
     during: openTo(/dashboard)
```

## 6. Timing & Observability (Implemented)

### Global Timeout Warnings

Every action emits console warnings if it exceeds the `warnAfter` threshold (default: 500ms):

```
⏱ 523ms - see('dashboard') - still waiting...
⏱ 1247ms - see('dashboard') - still waiting...
✓ 1892ms - see('dashboard') - completed
```

### Configuration

```typescript
defineConfig({
  actionTimeout: 5000,  // Fail after 5s
  warnAfter: 500,       // Warn after 500ms
})
```

### Debug Selector Explorer (Implemented)

When a selector fails to match, use `explainSelector()` to debug:

```typescript
import { explainSelector } from '@scenecheck/scenes'

const result = await explainSelector(page, 'my-selector')
// {
//   found: false,
//   count: 0,
//   matches: [],
//   suggestions: ['my-selector-v2', 'my-selectors']
// }
```

---

## 7. Network Layer

**Section Status: Design Only**

**Purpose:** Environment control, not implementation testing.

### Goals

- Inject failures to test error states
- Mock responses for specific scenarios
- Simulate slow networks

### NOT Goals

- Assert specific API calls were made
- Verify request/response shapes
- Implementation testing

### Proposed API

```typescript
test('handles API failure', async ({ actor, network }) => {
  const user = await actor('user')

  // Inject failure
  network.fail('/api/profile')

  await user.openTo('/profile')
  await user.see('error-state')
})

test('loads large dataset', async ({ actor, network }) => {
  const user = await actor('user')

  // Mock response
  network.mock('/api/items', {
    items: generateItems(1000),
  })

  await user.openTo('/items')
  await user.see('pagination')
})

test('handles slow network', async ({ actor, network }) => {
  const user = await actor('user')

  // Add latency
  network.delay('/api/*', 3000)

  await user.openTo('/dashboard')
  await user.see('loading-skeleton')
})
```

### Implementation Notes

- Use Playwright's route interception
- Scope to individual actors or globally
- Reset between scenes

---

## 8. Snapshots

**Section Status: Design Only**

**Purpose:** Assert state hasn't changed unexpectedly.

### Simple API

```typescript
// Capture state
const before = await user.snapshot('profile-card')

// Do something
await user.click('edit')
await user.typeInto('name', 'New Name')
await user.click('cancel')

// Verify restored
await user.expectSnapshot('profile-card', before)
```

### Considerations

- What attributes to include/exclude?
- How to handle dynamic content (timestamps, IDs)?
- Storage format for snapshots
- Diff visualization

### Minimal API Surface

Single method for snapshot comparison:

```typescript
interface SequentialActorHandle {
  // Capture current state of selector
  snapshot(selector: Selector): Promise<Snapshot>

  // Assert current state matches snapshot
  expectSnapshot(selector: Selector, expected: Snapshot): ActionChain
}
```

---

## 9. Configuration Reference

```typescript
defineConfig({
  baseUrl: 'http://localhost:3000',
  scenes: './scenes',

  // Browser settings
  browser: 'chromium',  // 'chromium' | 'firefox' | 'webkit'
  headed: false,
  slowMo: 0,

  // Timing
  timeout: 30000,       // Scene timeout
  actionTimeout: 5000,  // Individual action timeout
  warnAfter: 500,       // Console warning threshold

  // Reporting
  reportDir: './scenecheck-reports',
  reportFormat: 'html', // 'html' | 'json' | 'both'

  // Actor teams are auto-discovered from actors.ts or actors/*.ts
  // (not defined in config)

  // Hooks
  beforeAll: async () => { /* setup */ },
  afterAll: async () => { /* teardown */ },
  beforeEach: async (scene) => { /* per-scene setup */ },
  afterEach: async (scene, report) => { /* per-scene teardown */ },
})
```

---

## 10. Visualization

**Section Status: Conceptual** - User-requested feature, needs design.

The user mentioned wanting a visualization tool that shows:

> "a shape/overview/lets you play the song of each of your different scenes and shows your actors move through them, each with their own shape and instrument playing along with the others"

This would be a separate tool that:

1. Reads scene reports
2. Visualizes actor timelines
3. Shows warning hotspots
4. Plays back scenes as "music" - each actor as an instrument

Implementation would be a separate package (`@scenecheck/visualizer`) consuming the JSON reports.
