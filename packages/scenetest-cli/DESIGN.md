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
import { scene } from 'scenetest-cli'

scene('user updates their profile', async ({ cast }) => {
  // Cast an actor from the current cast's "primary_user_1" role
  const user = await cast('primary_user_1')

  // Navigate and interact
  await user.openTo('/settings/profile')
  await user.see('profile-form')
  await user.typeInto('display-name', 'New Name')
  await user.click('save-button')
  await user.seeToast('success-toast')
})
```

### Multi-Actor Scene

```ts
// scenes/social/friend-request-flow.spec.ts
import { scene, when } from 'scenetest-cli'

scene('sending and receiving friend requests', async ({ cast }) => {
  // These come from the same cast - stranger is NOT friends with primary_user_1
  const sender = await cast('primary_user_1')
  const receiver = await cast('stranger')

  // Sender finds and requests receiver
  await sender.openTo(`/friends/search?q=${receiver.username}`)
  await sender.see(`user-card-${receiver.id}`)
  await sender.click('send-request-button')

  // Declare early: when receiver accepts, sender should see confirmation
  // This goes on the message bus - no race condition worries
  when(
    'receiver accepts request',
    () => sender.seeToast('friend-confirmed-toast')
  )

  // Receiver gets notification and accepts
  await receiver.see('notification-badge')
  await receiver.click('notifications-button')
  await receiver.see('friend-request-item')
  await receiver.click('accept-button')

  // Emit to bus - triggers the sender's waiting assertion
  when(
    () => receiver.seeToast('friend-added-toast'),
    'receiver accepts request'
  )

  // Both users see each other in friends list
  await sender.openTo('/friends')
  await sender.seeText(receiver.username)

  await receiver.openTo('/friends')
  await receiver.seeText(sender.username)
})
```

## Actor Model

### Concepts

- **Role**: A relationship configuration in your test world. Not just "a user" but "primary_user_1" or "friend_of_1_and_2" - roles describe how actors relate to each other.
- **Actor**: A concrete test account that fills a role (e.g., alice@test.com playing "primary_user_1")
- **Cast**: A complete, internally-consistent set of actors where all relationships hold. Like a theater production - Cast A and Cast B can each perform the whole play.

### The Cast Model

Roles describe relationships, not just user types. For example:
- `primary_user_1` - the main character in scenes
- `primary_user_2` - a secondary main character
- `friend_of_1_and_2` - someone who is friends with both primary users
- `stranger` - someone with no existing relationships
- `new_user` - fresh account, no activity

A **cast** is a complete set of actors that fulfills all roles with correct relationships:

```
Cast 0: {
  primary_user_1: alice,
  primary_user_2: bob,
  friend_of_1_and_2: charlie,  // charlie is friends with alice AND bob
  stranger: diana,
  new_user: eve
}

Cast 1: {
  primary_user_1: frank,
  primary_user_2: grace,
  friend_of_1_and_2: henry,    // henry is friends with frank AND grace
  stranger: iris,
  new_user: jack
}

Cast 2: {
  primary_user_1: kate,
  primary_user_2: leo,
  friend_of_1_and_2: mia,      // mia is friends with kate AND leo
  stranger: noah,
  new_user: olivia
}
```

Each cast is a self-contained world. The relationships are baked into your seed data.

### Configuration

```ts
// scenetest.config.ts
import { defineConfig } from 'scenetest-cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  // Define complete casts - each is an internally-consistent world
  casts: [
    {
      primary_user_1: { id: 'alice', username: 'alice', email: 'alice@test.com', password: 'test123' },
      primary_user_2: { id: 'bob', username: 'bob', email: 'bob@test.com', password: 'test123' },
      friend_of_1_and_2: { id: 'charlie', username: 'charlie', email: 'charlie@test.com', password: 'test123' },
      stranger: { id: 'diana', username: 'diana', email: 'diana@test.com', password: 'test123' },
      new_user: { id: 'eve', username: 'eve', email: 'eve@test.com', password: 'test123' },
    },
    {
      primary_user_1: { id: 'frank', username: 'frank', email: 'frank@test.com', password: 'test123' },
      primary_user_2: { id: 'grace', username: 'grace', email: 'grace@test.com', password: 'test123' },
      friend_of_1_and_2: { id: 'henry', username: 'henry', email: 'henry@test.com', password: 'test123' },
      stranger: { id: 'iris', username: 'iris', email: 'iris@test.com', password: 'test123' },
      new_user: { id: 'jack', username: 'jack', email: 'jack@test.com', password: 'test123' },
    },
    {
      primary_user_1: { id: 'kate', username: 'kate', email: 'kate@test.com', password: 'test123' },
      primary_user_2: { id: 'leo', username: 'leo', email: 'leo@test.com', password: 'test123' },
      friend_of_1_and_2: { id: 'mia', username: 'mia', email: 'mia@test.com', password: 'test123' },
      stranger: { id: 'noah', username: 'noah', email: 'noah@test.com', password: 'test123' },
      new_user: { id: 'olivia', username: 'olivia', email: 'olivia@test.com', password: 'test123' },
    },
  ],
})
```

### How Casting Works

When a scene runs, it gets assigned an available cast index. All `cast()` calls within that scene pull from the same cast:

```ts
scene('unfriending flow', async ({ cast }) => {
  // Scene is assigned cast index 1 (automatically or via cast.which(1))
  const user = await cast('primary_user_1')        // frank
  const friend = await cast('friend_of_1_and_2')   // henry (friends with frank)

  // Guaranteed: henry is friends with frank in the seed data
  await user.openTo('/friends')
  await user.seeText(friend.username)  // henry appears in frank's friends list
})
```

### Concurrency

Concurrency is trivial with this model:
- 3 casts = 3 scenes can run simultaneously
- Each scene gets exclusive use of one cast
- No conflicts, no race conditions between scenes
- Want more parallelism? Add more casts to your seed data

### Casting Rules

1. Each scene is assigned one cast index at start
2. All `cast()` calls in that scene use that index
3. A cast can only be used by one scene at a time
4. When the scene ends, the cast is released
5. If no casts are available, scene waits (or fails with timeout)

### Actor Interface

When you cast an actor, you get a handle with:

```ts
const user = await cast('primary_user_1')

// Actor properties (from config)
user.id         // 'alice'
user.username   // 'alice'
user.email      // 'alice@test.com'

// Browser context (each actor has isolated context)
user.page       // Playwright Page

// Navigation
await user.openTo('/path')

// Element interactions (by test ID, supports nested: 'parent child')
await user.see('element-id')          // wait for visibility
await user.see('modal form')          // wait for nested element
await user.click('button-id')         // click
await user.typeInto('input-id', 'text') // fill input
await user.seeText('some text')       // wait for text
await user.seeToast('toast-id')       // wait for appear AND disappear

// Chaining
await user
  .see('form')
  .typeInto('email', 'test@test.com')
  .click('submit')
  .seeToast('success')

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
  await user1.see('notification')
  await user1.click('view-friend')
})

// Function trigger, string action
when(
  () => user2.seeToast('request-accepted-toast'),
  'user2 accepts'
)

// Function trigger, function action
when(
  () => user1.see('form-submitted'),
  () => user2.openTo('/inbox')
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
  .see('login-form')
  .typeInto('email', 'test@test.com')
  .typeInto('password', 'secret')
  .click('submit')
  .see('dashboard')

// Execute all actions in sequence
await chain
```

Or use `await` directly for single actions:

```ts
await user.see('login-form')
await user.click('submit')
```

### Chain Methods

```ts
user
  .openTo('/path')                    // Navigate
  .see('test-id')                   // Wait for element by test ID
  .see('parent child')              // Wait for nested element
  .seeText('text')                  // Wait for text content
  .seeToast('toast-id')             // Wait for appear AND disappear
  .click('test-id')                 // Click by test ID
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
        { "action": "openTo", "target": "/settings/profile", "actor": "user", "timestamp": 1705315800000 },
        { "action": "see", "target": "profile-form", "actor": "user", "timestamp": 1705315801000 }
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

  // Casts - each is a complete, internally-consistent set of actors
  // More casts = more parallelism
  casts: [
    {
      primary_user_1: { id: 'alice', username: 'alice', email: 'alice@test.com', password: 'test123' },
      primary_user_2: { id: 'bob', username: 'bob', email: 'bob@test.com', password: 'test123' },
      friend_of_1_and_2: { id: 'charlie', username: 'charlie', email: 'charlie@test.com', password: 'test123' },
      stranger: { id: 'diana', username: 'diana', email: 'diana@test.com', password: 'test123' },
    },
    // Add more casts for more parallelism...
  ],

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
│   ├── cast-manager.ts     # Cast assignment and lifecycle
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

Concurrency is built into the cast model:
- N casts = N scenes can run in parallel
- Each scene gets exclusive use of one cast
- `--concurrency N` flag to limit parallelism (defaults to number of casts)
- Want more parallelism? Add more casts to your seed data

### CI Integration

Eventually:
- `--ci` flag for CI mode
- Exit codes based on assertion results
- Configurable thresholds ("fail if >0 failed assertions")
- JUnit/TAP output formats

### Authentication Helpers

Common pattern support:
```ts
const user = await cast('primary_user_1', {
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
