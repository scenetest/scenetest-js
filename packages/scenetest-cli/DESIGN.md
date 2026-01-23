# scenetest-cli Design Document

## Overview

`scenetest-cli` is a browser automation tool for running scene specs - scripted user journeys that exercise your application while collecting inline assertions from your app code.

Unlike traditional test runners that gate CI with pass/fail exit codes, scenetest-cli generates **reports**. The assertions come from inside your application (via `pass()` and `fail()` calls), and the scene specs describe what users do. The report shows what happened; humans interpret it.

## Philosophy

1. **Scenes describe user journeys, not implementation details.** A scene says "user sees confirmation" not "element with class .confirm-modal is visible".

2. **Assertions live in app code.** The scene runner orchestrates; the app validates its own invariants.

3. **Developer experience first.** Interactive `--ui` mode lets you watch scenes run, keep clicking manually, do HMR, iterate until it looks right, then re-run.

4. **Reports over exit codes.** For now, we generate reports. CI integration (pass/fail gating) comes later.

## CLI Interface

```bash
# Run all scenes, generate report
scenetest

# Run specific scene(s)
scenetest scenes/login.spec.ts
scenetest scenes/checkout/

# Interactive UI mode - opens browser you can watch
scenetest --ui

# Headed mode (see browsers but non-interactive)
scenetest --headed

# Output options
scenetest --report ./reports/     # output directory
scenetest --format json|html      # report format
```

### Common Workflow

```bash
# In package.json
{
  "scripts": {
    "test:reset": "pnpm db:reset && pnpm db:seed && scenetest --ui"
  }
}
```

Developer resets DB, seeds actors, runs scenes interactively, iterates.

## Scene Spec Files

Scene specs live in `/scenes/` (configurable) and use `.spec.ts` extension.

```
scenes/
├── user-updates-profile.spec.ts
├── checkout/
│   ├── guest-checkout.spec.ts
│   └── returning-customer.spec.ts
└── social/
    └── friend-request-flow.spec.ts
```

Scenes run alphabetically by default. Concurrency comes later.

### Basic Structure

```ts
// scenes/user-updates-profile.spec.ts
import { scene, role } from 'scenetest-cli'

scene('user updates their profile', async ({ cast }) => {
  // Cast an actor into the "user" role
  const user = await cast(role('authenticated-user'))

  // Navigate and interact
  await user.goto('/settings/profile')
  await user.seeId('profile-form')
  await user.typeInto('display-name', 'New Name')
  await user.clickId('save-button')
  await user.seeId('success-toast')
})
```

### Multi-Actor Scene

```ts
// scenes/social/friend-request-flow.spec.ts
import { scene, role, when } from 'scenetest-cli'

scene('sending and receiving friend requests', async ({ cast }) => {
  const sender = await cast(role('authenticated-user'))
  const receiver = await cast(role('authenticated-user'))

  // Sender finds and requests receiver
  await sender.goto(`/friends/search?q=${receiver.username}`)
  await sender.seeId(`user-card-${receiver.id}`)
  await sender.clickId('send-request-button')

  // Declare early: when receiver accepts, sender should see confirmation
  // This goes on the message bus - no race condition worries
  when(
    'receiver accepts request',
    () => sender.seeId('friend-confirmed-toast')
  )

  // Receiver gets notification and accepts
  await receiver.seeId('notification-badge')
  await receiver.clickId('notifications-button')
  await receiver.seeId('friend-request-item')
  await receiver.clickId('accept-button')

  // Emit to bus - triggers the sender's waiting assertion
  when(
    () => receiver.seeId('friend-added-toast'),
    'receiver accepts request'
  )

  // Both users see each other in friends list
  await sender.goto('/friends')
  await sender.seeText(receiver.username)

  await receiver.goto('/friends')
  await receiver.seeText(sender.username)
})
```

## Actor Model

### Concepts

- **Role**: A type of user needed for a scene (e.g., "authenticated-user", "admin", "guest")
- **Actor**: A concrete test account that can play a role (e.g., alice@test.com, bob@test.com)
- **Cast**: Assigning an actor to play a role in a scene

### Actor Pool

Actors are pre-seeded in your database. You configure which actors can play which roles:

```ts
// scenetest.config.ts
import { defineConfig } from 'scenetest-cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  actors: {
    // Role name -> array of actors that can fill it
    'authenticated-user': [
      { id: 'user-1', username: 'alice', email: 'alice@test.com', password: 'test123' },
      { id: 'user-2', username: 'bob', email: 'bob@test.com', password: 'test123' },
      { id: 'user-3', username: 'charlie', email: 'charlie@test.com', password: 'test123' },
    ],
    'admin': [
      { id: 'admin-1', username: 'admin', email: 'admin@test.com', password: 'admin123' },
    ],
    'guest': [
      // Guests don't need credentials - just a browser context
      { id: 'guest-1' },
      { id: 'guest-2' },
    ],
  },
})
```

### Casting Rules

1. An actor can only be in one scene at a time
2. When a scene needs a role, an available actor is assigned
3. When the scene ends, the actor returns to the pool
4. If no actors are available for a role, the scene waits (or fails with timeout)

This enables future concurrency: if you have 5 "authenticated-user" actors, you can run up to 5 scenes that each need one such user.

### Actor Interface

When you cast an actor, you get a handle with:

```ts
const user = await cast(role('authenticated-user'))

// Actor properties (from config)
user.id         // 'user-1'
user.username   // 'alice'
user.email      // 'alice@test.com'

// Browser context (each actor has isolated context)
user.page       // Playwright Page

// Navigation
await user.goto('/path')

// Element interactions (by test ID)
await user.seeId('element-id')        // wait for visibility
await user.clickId('button-id')       // click
await user.typeInto('input-id', 'text') // fill input
await user.seeText('some text')       // wait for text

// Chaining
await user
  .seeId('form')
  .typeInto('email', 'test@test.com')
  .clickId('submit')
  .seeId('success')

// Low-level access when needed
await user.page.locator('.custom-selector').click()
```

## Message Bus & `when()`

The `when()` function coordinates between actors and handles timing.

### Signature

```ts
when(trigger, action)
```

- **trigger**: What to wait for
  - `string` → Wait for this message on the bus
  - `() => Promise<void>` → Wait for this to complete (e.g., DOM condition)

- **action**: What to do when triggered
  - `string` → Emit this message to the bus
  - `() => Promise<void>` → Execute this function

### Key Behavior: Sticky Messages

Messages persist on the bus. If you listen AFTER a message was emitted, you still receive it (once).

This is critical. It means you can declare causality early in your scene without worrying about race conditions:

```ts
// Declare early: "when X happens, do Y"
when('payment-confirmed', () => user.seeId('receipt'))

// ... lots of other scene actions ...

// Later, this fires - the listener above still triggers
when(() => stripe.webhookReceived(), 'payment-confirmed')
```

### Examples

```ts
// String trigger, function action
when('user2 accepts', async () => {
  await user1.seeId('notification')
  await user1.clickId('view-friend')
})

// Function trigger, string action
when(
  () => user2.seeId('request-accepted-toast'),
  'user2 accepts'
)

// Function trigger, function action
when(
  () => user1.seeId('form-submitted'),
  () => user2.goto('/inbox')
)

// String trigger, string action (relay)
when('step-1-done', 'ready-for-step-2')
```

### Message Bus Scope

Each scene run gets its own message bus. Messages don't leak between scenes.

## Chainable DSL

All actor methods return a chainable builder. Call without `await` to build up actions, then execute:

```ts
// Build chain
const chain = user
  .seeId('login-form')
  .typeInto('email', 'test@test.com')
  .typeInto('password', 'secret')
  .clickId('submit')
  .seeId('dashboard')

// Execute all actions in sequence
await chain
```

Or use `await` directly for single actions:

```ts
await user.seeId('login-form')
await user.clickId('submit')
```

### Chain Methods

```ts
user
  .goto('/path')                    // Navigate
  .seeId('test-id')                 // Wait for element by test ID
  .seeText('text')                  // Wait for text content
  .clickId('test-id')               // Click by test ID
  .typeInto('test-id', 'value')     // Fill input by test ID
  .check('test-id')                 // Check checkbox
  .select('test-id', 'option')      // Select dropdown option
  .wait(1000)                       // Wait ms (use sparingly)
  .emit('message')                  // Emit to message bus
  .do(async (page) => { ... })      // Custom action
```

## Reports

Scene runs generate reports containing:

1. **Scene metadata**: name, file, duration, timestamp
2. **Actor assignments**: which actors played which roles
3. **Timeline**: sequence of actions taken
4. **Assertions**: all `pass()` and `fail()` calls from app code, with:
   - Description
   - Result (pass/fail)
   - Timestamp
   - Source location (file:line)
   - Context data
   - Which actor's browser triggered it

### Report Format

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "duration": 4523,
  "scenes": [
    {
      "name": "user updates their profile",
      "file": "scenes/user-updates-profile.spec.ts",
      "status": "completed",
      "actors": {
        "user": { "id": "user-1", "username": "alice" }
      },
      "assertions": [
        {
          "type": "pass",
          "description": "profile form loads with current data",
          "result": true,
          "timestamp": 1705315802000,
          "location": { "file": "/src/components/ProfileForm.tsx", "line": 42 },
          "context": { "userId": "user-1" },
          "actor": "user"
        }
      ],
      "timeline": [
        { "action": "goto", "target": "/settings/profile", "actor": "user", "timestamp": 1705315800000 },
        { "action": "seeId", "target": "profile-form", "actor": "user", "timestamp": 1705315801000 }
      ]
    }
  ],
  "summary": {
    "scenes": 1,
    "assertions": { "total": 5, "passed": 5, "failed": 0 }
  }
}
```

### HTML Report

A human-readable HTML report with:
- Summary dashboard
- Scene-by-scene breakdown
- Assertion details with source links
- Timeline visualization
- Filter by passed/failed

## Interactive UI Mode

`scenetest --ui` opens an interactive session:

1. **Browser window**: Watch scenes run in real-time
2. **Keep clicking**: After scenes complete, manually interact
3. **HMR**: Modify app code, see changes, keep testing
4. **Assertion panel**: Live view of assertions as they fire
5. **Re-run**: Reset and run scenes again

The dev panel from `vite-plugin-scenetest` shows assertions in the browser. The CLI's UI mode orchestrates but lets you take over.

### Workflow

```bash
pnpm test:reset   # Resets DB, seeds actors, opens scenetest --ui
```

1. Watch scenes run
2. See assertion panel fill up
3. Notice something off → fix code → HMR reloads
4. Keep clicking to verify
5. "Looks good" → re-run scenes from scratch
6. All green → commit

## Configuration

```ts
// scenetest.config.ts
import { defineConfig } from 'scenetest-cli'

export default defineConfig({
  // Required
  baseUrl: 'http://localhost:5173',

  // Scene discovery
  scenes: './scenes',           // directory or glob
  ignore: ['**/_*.spec.ts'],    // patterns to skip

  // Actor pool
  actors: {
    'authenticated-user': [...],
    'admin': [...],
  },

  // Browser settings
  browser: 'chromium',          // chromium | firefox | webkit
  headed: false,                // show browser by default
  slowMo: 0,                    // slow down actions (ms)

  // Timeouts
  timeout: 30000,               // scene timeout
  actionTimeout: 5000,          // individual action timeout

  // Reports
  reportDir: './scenetest-reports',
  reportFormat: 'html',         // html | json | both

  // Hooks
  beforeAll: async () => { ... },
  afterAll: async () => { ... },
  beforeEach: async (scene) => { ... },
  afterEach: async (scene, report) => { ... },
})
```

## Architecture

```
scenetest-cli/
├── src/
│   ├── cli.ts              # CLI entry point (commander/yargs)
│   ├── config.ts           # Config loading and validation
│   ├── runner.ts           # Scene runner orchestration
│   ├── actor-pool.ts       # Actor pool management
│   ├── message-bus.ts      # Message bus implementation
│   ├── scene-context.ts    # Context passed to scene functions
│   ├── actor.ts            # Actor class with chainable DSL
│   ├── chain.ts            # Chainable action builder
│   ├── reporter.ts         # Report generation
│   └── ui/                 # Interactive UI mode
│       ├── server.ts       # Dev server integration
│       └── panel.ts        # Assertion panel
├── DESIGN.md
├── package.json
└── tsconfig.json
```

### Dependencies

- **Playwright**: Browser automation (we use it under the hood, users don't touch it)
- **Commander/Yargs**: CLI parsing
- **Vite**: For `--ui` mode integration with HMR

## Future Considerations

### Concurrency

When we add concurrency:
- Multiple scenes run in parallel
- Actor pool prevents conflicts
- Each scene gets actors from pool, returns them when done
- `--concurrency N` flag to control parallelism

### CI Integration

Eventually:
- `--ci` flag for CI mode
- Exit codes based on assertion results
- Configurable thresholds ("fail if >0 failed assertions")
- JUnit/TAP output formats

### Authentication Helpers

Common pattern support:
```ts
const user = await cast(role('authenticated-user'), {
  authenticate: true  // auto-login before scene starts
})
```

### Visual Regression

Integration with screenshot comparison:
```ts
await user.snapshot('profile-page')  // captures and compares
```

---

## Open Questions

1. **Scene isolation**: Should each scene get fresh browser contexts, or reuse?
2. **Assertion ownership**: When multiple actors are on the same page via different tabs, how do we attribute assertions?
3. **Selector strategy**: Test IDs only? Support for text, role, label selectors?
4. **Error handling**: What happens when an action fails? Fail scene immediately or continue?
