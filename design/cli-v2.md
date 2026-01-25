# Scenetest CLI v2 Design Document

This document captures the design for the next evolution of the scenetest CLI, including implemented features and future considerations.

## 1. Philosophy

### Core Principles

- **User journey testing, not implementation testing** - Test what users see and do, not internal API calls
- **Accessibility-first selector resolution** - Encourage good accessibility by making aria attributes primary selectors
- **Declarative scenes as data** - Scenes can be expressed as simple text arrays
- **Observable but non-blocking warnings** - Script-level warnings (`warnIf`) don't fail tests but surface unexpected paths

### What Scenetest Is NOT

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

### Grammar

```
<action> <selector> [<value>]

Actions:
  openTo <url>                    - Navigate to URL
  see <selector>                  - Wait for element visible (updates scope)
  notSee <selector>               - Wait for element hidden
  seeText <text>                  - Wait for text visible
  seeToast <selector>             - Wait for element appear then disappear
  click <selector>                - Click element within scope
  typeInto <selector> <value>     - Fill input
  check <selector>                - Check checkbox
  select <selector> <value>       - Select dropdown option
  wait <ms>                       - Wait milliseconds
  emit <message>                  - Emit to message bus
  warnIf <selector> <message>     - Register script warning
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

## 3. Selector Resolution (Implemented)

### Priority Order

Selectors resolve using a combined CSS selector that matches any of:

1. `data-testid` - Explicit test identifier
2. `id` - DOM id attribute
3. `aria-label` - Accessibility label (encouraged for interactive elements)
4. `name` - Form element name
5. `data-name` - Custom name attribute

### Sigil Prefixes

- `~name` - Alias lookup (configured in `setAliases()`)
- `@label` - Explicit aria-label lookup

### Tuple Selectors for Lists

For elements in lists, use tuple syntax `[name, key]`:

```typescript
// Find element with data-name="playlist-row" AND data-key="12345"
await user.see(['playlist-row', '12345'])
await user.click(['playlist-row', '12345'])

// Nested with key
await user.see(['list playlist-row', '12345'])
```

The key matches against `data-key` attribute, enabling selection of specific items in repeated structures.

### Aliases

Configure selector aliases for common patterns:

```typescript
import { setAliases } from '@scenetest/cli'

setAliases({
  'container': '[data-container]',
  'modal': '[role=dialog]',
  'nav': '[role=navigation]',
})

// Usage
await user.see('~container')
await user.up('~modal')
```

## 4. Chaining Model (Implemented)

### Scope Propagation

`see()` updates the current scope. Subsequent actions operate within that scope:

```typescript
await user
  .see('playlist-row', '12345')  // Scope → playlist row
  .click('like-button')          // Click within that row
  .see('liked-indicator')        // Verify within that row
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

## 5. Assertion Types

### App-Side Assertions

- `should(description, condition, context?)` - Assert truthy condition
- `failed(description, context?)` - Mark unexpected code path

These live in application code and report via `window.__scenetest_report`.

### Script Warnings (Implemented)

- `warnIf(selector, message)` - Register warning if selector appears

Warnings are script-level observations, not application failures. They indicate "we reached somewhere unexpected in our test script."

```typescript
// This user should have dismissed the welcome modal
user.warnIf('welcome-modal', 'user should have dismiss flag set')
await user.openTo('/dashboard')
```

Warnings:
- Don't fail tests
- Persist for the entire scene
- Are reported separately from assertions
- Help identify flaky or outdated test scripts

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
import { explainSelector } from '@scenetest/cli'

const result = await explainSelector(page, 'my-selector')
// {
//   found: false,
//   count: 0,
//   matches: [],
//   suggestions: ['my-selector-v2', 'my-selectors']
// }
```

---

## 7. Future: Network Layer (Design Only)

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
scene('handles API failure', async ({ cast, network }) => {
  const user = await cast('user')

  // Inject failure
  network.fail('/api/profile')

  await user.openTo('/profile')
  await user.see('error-state')
})

scene('loads large dataset', async ({ cast, network }) => {
  const user = await cast('user')

  // Mock response
  network.mock('/api/items', {
    items: generateItems(1000),
  })

  await user.openTo('/items')
  await user.see('pagination')
})

scene('handles slow network', async ({ cast, network }) => {
  const user = await cast('user')

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

## 8. Future: Snapshots (Design Only)

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
interface ActorHandle {
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
  reportDir: './scenetest-reports',
  reportFormat: 'html', // 'html' | 'json' | 'both'

  // Casts
  casts: [
    {
      user: { id: 'user-1', username: 'alice' },
      admin: { id: 'admin-1', username: 'admin' },
    },
  ],

  // Hooks
  beforeAll: async () => { /* setup */ },
  afterAll: async () => { /* teardown */ },
  beforeEach: async (scene) => { /* per-scene setup */ },
  afterEach: async (scene, report) => { /* per-scene teardown */ },
})
```

---

## 10. Future: Visualization (Conceptual)

The user mentioned wanting a visualization tool that shows:

> "a shape/overview/lets you play the song of each of your different scenes and shows your actors move through them, each with their own shape and instrument playing along with the others"

This would be a separate tool that:

1. Reads scene reports
2. Visualizes actor timelines
3. Shows warning hotspots
4. Plays back scenes as "music" - each actor as an instrument

Implementation would be a separate package (`@scenetest/visualizer`) consuming the JSON reports.
