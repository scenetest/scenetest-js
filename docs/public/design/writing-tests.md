# Writing Tests with Scenetest

> **For humans and language models writing scenetest specs in application repos.**
> This is the test-authoring reference. For contributing to scenetest itself, see the repo's CLAUDE.md.

---

## How Scenetest Works

Scenetest separates two concerns that traditional E2E frameworks conflate:

1. **Scenes** — Orchestration scripts that simulate user journeys (login, fill form, click submit). Written in spec files. The person writing scenes doesn't need to know implementation details.
2. **Inline Assertions** — `should()` and `failed()` calls placed directly in application code (components, hooks, callbacks). They run every time that code executes, whether triggered by a scene, the dev panel, or a human clicking around.

Scenes test **user journeys**. Inline assertions test **the developer's mental model** of how the system works. These are different things and benefit from being authored by different people in different places.

### What to put where

| Concern | Where it goes | Who writes it | Example |
|---------|--------------|---------------|---------|
| "User can log in and update their profile" | Scene spec file (`scenes/*.spec.ts` or `scenes/*.spec.md`) | QA, PM, or developer | `user.openTo('/login')` ... `user.click('submit')` |
| "Profile data should be loaded before render" | Inline assertion in component | Component author | `should('profile loaded', profile !== undefined)` |
| "Form should not submit with empty name" | Inline assertion in submit handler | Feature developer | `failed('empty name submitted', { name })` |
| "After mutation, cache matches server" | Multi-context assertion (future) | Feature developer | `assert({ title: '...', serverFn, withData })` |

---

## Authoring models

There are three ways to write spec files. All use the same actor DSL methods (`see`, `click`, `typeInto`, etc.) and the same selector resolution, configuration, and team management. They differ in **syntax and execution model**.

| Style | File | Execution model | Best for |
|-------|------|----------------|----------|
| **Text DSL (md)** | `.spec.md` | Compiles to `flow()` | Simplest way to write a declarative spec with as many actors as you want |
| **Declarative (ts)** | `.spec.ts` | `flow()` — reactive concurrent | When macros aren't enough: full TypeScript control over your scene spec |
| **Classic Driver (ts)** | `.spec.ts` | `scene()` — sequential | Same async actor model you know from Cypress/Playwright, but with access to the Scenetest message bus and our document selectors |

- **Text DSL** — human-readable `.spec.md` files that compile to declarative actor scripts. Readable and writable by non-engineers.
- **Declarative** — no async/await, no race conditions, no `Promise.all`. You declare what happens; actors drain their queues concurrently.
- **Classic Driver** — the Playwright/Cypress model where each `await` fires an instruction at the browser in real time.

> **STATUS: Both `flow()` (declarative) and `scene()` (classic driver) execution models are implemented. We are evaluating which to keep long-term. See `docs/public/design/scene-vs-flow.md` for the trade-off analysis. Before 1.0, one will be removed. Text DSL `.spec.md` files compile to `flow()`.

### Markdown scenes (.spec.md)

Write specs as **human-readable markdown** — GitHub-renderable and executable. Each `.spec.md` file compiles to `flow()` registrations.

```markdown
# User friend requests
## new user signs up and gets a friend request
new-user:
- openTo /
- see welcome-box
- click continue-button

primary-user:
- openTo /friends
- click main-navbar search
- typeInto search-input [new-user.username]
- see search-results-section
- click friend-request-button

new-user:
- seeToast friend-request
- see navbar notifications-badge
- click
- see notifications-menu-expanded new-friend-request
- click

## old user re-activates account
returning-user:
- openTo /login
- see login-form
- typeInto email [returning-user.email]
- click submit
```

**Format rules:**
- `#` headings are **group names** (optional hierarchy)
- `##` headings are **scene names** (each becomes a `flow()` registration)
- If no `##` headings exist, `#` headings are promoted to scene names
- `role-name:` switches the active actor for subsequent lines (screenplay-cue syntax). `role-name: action args` is also supported as an inline shorthand
- Action lines use the same text DSL grammar (`openTo`, `see`, `click`, `typeInto`, etc.)
- Lines may start with `- ` or `1. ` (markdown list prefix is stripped) for readability
- `// comment` lines become `console.log` during execution
- `[actor.field]` interpolates actor config values (username, email, etc.)
- `if <selector>` followed by indented lines creates a conditional monitor
- `name()` or `name() <args>` invokes a registered macro
- `waitFor <message>` blocks the actor until a bus message arrives
- Bare `click` (no selector) clicks the current scope element
- Bare `up` (no selector) resets scope to the page root

**Multi-actor coordination in markdown:**

```markdown
# sender and receiver exchange messages
sender:
- openTo /login
- // log in and compose
- see login-form
- typeInto email [sender.email]
- typeInto password [sender.password]
- click submit
- see compose
- typeInto body Hello!
- click send
- emit sender-ready

receiver:
- waitFor sender-ready
- openTo /inbox
- seeText New message
```

### Classic Driver (ts) — scene(), await-driven sequential orchestration

```typescript
import { scene } from '@scenetest/cli'

scene('user updates their profile', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/login')
  await user
    .see('login-form')
    .typeInto('email', user.email)
    .typeInto('password', user.password)
    .click('submit')

  await user.see('dashboard')
  await user.openTo('/profile')
  await user
    .see('profile-form')
    .typeInto('name-input', 'New Name')
    .click('save-button')

  await user.seeText('New Name')
})
```

**How it works:** Each DSL call (`.see()`, `.click()`, etc.) pushes an action onto a chain. The chain is inert until you `await` it, at which point all queued actions execute sequentially. Scope resets between `await` boundaries — each `await` creates a new chain.

**When to use:** Single-actor flows where you want explicit step-by-step control, or when migrating from Playwright/Cypress patterns.

### Declarative (ts) — flow(), reactive concurrent draining

```typescript
import { flow } from '@scenetest/cli'

flow('user updates their profile', ({ actor }) => {
  const user = actor('user')

  user.openTo('/login')
  user
    .see('login-form')
    .typeInto('email', user.email!)
    .typeInto('password', user.password!)
    .click('submit')

  user.see('dashboard')
  user.openTo('/profile')
  user
    .see('profile-form')
    .typeInto('name-input', 'New Name')
    .click('save-button')

  user.seeText('New Name')
})
```

**How it works:** The entire function body is **synchronous declaration**. `actor()` returns a handle immediately (config is resolved, browser launches later). DSL calls push to a persistent queue on the actor and return the actor itself. Nothing executes during the function body. After it returns, browsers launch in parallel, then all actors drain their queues concurrently. Each actor advances through its own queue as fast as the DOM allows.

**When to use:** Multi-actor scenes (concurrency is automatic), or when you want to write specs without thinking about timing. `see`/`seeText` naturally poll for DOM state, so cross-actor sync happens through the application, not through `await` ordering.

### How to tell them apart

| | Classic Driver — `scene()` | Declarative — `flow()` |
|---|---------|--------|
| **Import** | `import { scene } from '@scenetest/cli'` | `import { flow } from '@scenetest/cli'` |
| **`actor()` call** | `const user = await actor('user')` | `const user = actor('user')` (sync) |
| **Function signature** | `async ({ actor }) => { ... }` | `({ actor }) => { ... }` (no async needed) |
| **DSL calls need `await`?** | Yes — `await` triggers execution | No — calls just queue, execution is automatic |
| **What DSL methods return** | `ActionChain` (thenable, disposable) | The actor itself (chainable, not thenable) |
| **Where scope lives** | On the chain (resets at each `await`) | On the actor (persists through the entire queue) |
| **Multi-actor concurrency** | Explicit `Promise.all()` | Automatic — all actors drain concurrently |
| **`if(selector, cb)`** | Watcher that polls during actions, **cleared after each `await`** | Persistent one-shot monitor, polls for **all subsequent actions** |
| **`waitFor(message)`** | Not available (use `when()`) | Available — blocks actor's queue until bus message arrives |

### Critical: DO NOT mix the two models

- In a `scene()`, you MUST `await` DSL calls. Without `await`, the actions never execute and the scene silently does nothing.
- In a `flow()`, you MUST NOT `await` anything. Actor creation is synchronous, DSL calls are synchronous. The entire body is pure declaration — no `async`, no `await`.

---

## Writing inline assertions

```tsx
// components/ProfileForm.tsx
import { should, failed } from '@scenetest/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

---

## Multi-actor examples

### Classic Driver — sequential by default, explicit concurrency

```typescript
scene('two users can chat', async ({ actor }) => {
  const alice = await actor('alice')
  const bob = await actor('bob')

  // Sequential — alice acts, then bob acts
  await alice.openTo('/chat')
  await bob.openTo('/chat')

  await alice
    .see('message-input')
    .typeInto('message-input', 'Hello Bob!')
    .click('send-button')

  await bob.seeText('Hello Bob!')

  // For true concurrency, use Promise.all:
  // await Promise.all([
  //   alice.openTo('/chat'),
  //   bob.openTo('/chat'),
  // ])
})
```

### Declarative — concurrent by default, explicit synchronization only when needed

```typescript
flow('two users can chat', ({ actor }) => {
  const alice = actor('alice')
  const bob = actor('bob')

  // Both actors' queues drain concurrently after this function returns.
  // No Promise.all needed — concurrency is the default.

  alice.openTo('/chat')
  alice.see('message-input').typeInto('message-input', 'Hello Bob!').click('send-button')

  bob.openTo('/chat')
  bob.seeText('Hello Bob!')
  // ^ No race condition: bob will poll for "Hello Bob!" whenever he
  //   reaches that point in his queue. If alice hasn't sent it yet,
  //   bob just waits. If she has, it resolves instantly.
})
```

---

## Multi-actor coordination

**Classic Driver uses `when()` and `emit()`:**

```typescript
import { scene, when } from '@scenetest/cli'

scene('sender and receiver', async ({ actor }) => {
  const sender = await actor('sender')
  const receiver = await actor('receiver')

  when('sender-ready', async () => {
    await receiver.openTo('/inbox')
    await receiver.seeText('New message')
  })

  await sender.openTo('/login')
  // ... login flow ...
  await sender.emit('sender-ready')
  await sender.see('compose').typeInto('body', 'Hello!').click('send')
})
```

**Declarative uses `emit()` and `waitFor()` (but often doesn't need them):**

```typescript
import { flow } from '@scenetest/cli'

flow('sender and receiver', ({ actor }) => {
  const sender = actor('sender')
  const receiver = actor('receiver')

  sender.openTo('/login')
  // ... login flow ...
  sender.emit('sender-ready')
  sender.see('compose').typeInto('body', 'Hello!').click('send')

  // waitFor blocks receiver's queue until sender emits 'sender-ready'.
  // Often unnecessary — if the DOM is the source of truth, receiver's
  // see/seeText calls will naturally block until the UI updates.
  receiver.waitFor('sender-ready')
  receiver.openTo('/inbox')
  receiver.seeText('New message')
})
```

---

## Conditional monitors: if()

Both models support `if()` but with different lifecycles:

**Classic Driver:** Watcher polls during actions, cleared after each `await`.

```typescript
// classic driver model
user.if('welcome-modal', async () => {
  await user.click('dismiss')
})
await user.see('dashboard') // if() polls during this action, clears after
```

**Declarative:** Persistent one-shot monitor, polls during all subsequent actions.

```typescript
// declarative model
user.if('welcome-modal', a => a.click('dismiss'))
user.see('dashboard')
user.openTo('/profile')
// ^ The monitor polls during BOTH actions above.
//   Fires inline when matched, then stops (one-shot).
```

---

## Actor DSL Methods

These methods are available on actors in both the declarative and classic driver models:

| Method | Description |
|--------|-------------|
| `openTo(url)` | Navigate to URL (full page load) |
| `see(selector)` | Wait for element visible, set as current scope |
| `seeInView(selector)` | Wait for element visible **in the viewport** (no scrolling needed) |
| `notSee(selector)` | Wait for element hidden/detached |
| `seeText(text)` | Wait for text visible on page |
| `seeToast(selector)` | Wait for element to appear then disappear |
| `click(selector?)` | Click element within current scope. **Bare `click`** (no selector) clicks the scope element itself |
| `typeInto(selector, value)` | Fill input within current scope |
| `check(selector)` | Check checkbox |
| `select(selector, value)` | Select dropdown option |
| `wait(ms)` | Wait milliseconds |
| `emit(message)` | Emit to message bus (for multi-actor coordination) |
| `do(fn)` | Execute custom function with Playwright page |
| `up(selector?)` | Navigate to ancestor matching selector. **Bare `up`** (no selector) resets scope to page root |
| `prev()` | Return to previous scope |
| `scrollToBottom()` | Scroll current scope or page to bottom |
| `if(selector, callback)` | Conditional monitor (see "Conditional monitors" above) |
| `warnIf(selector, message)` | Script warning (persists across scene/flow) |
| `dsl(text)` | Queue actions from a multiline text DSL string (see "Text DSL" below) |

**Classic Driver (`scene()`):** Methods return an `ActionChain` that is chainable and thenable (await the chain to execute). `if` and `warnIf` return void.

**Declarative (`flow()`):** Methods return the actor itself (chainable, not thenable). `if`, `warnIf` return void. Additionally, `waitFor(message)` is available to block the actor's queue until a bus message arrives.

**Text DSL (`.spec.md`):** All text DSL actions are available directly as lines. `waitFor` is available. Bare `click` and bare `up` work as described above.

---

## Selector Resolution

The actor DSL uses a selector string that resolves against DOM attributes in priority order:

1. `aria-label`
2. `id`
3. `data-testid`
4. `data-name`
5. `data-key`
6. `name`

**Nested selectors** use spaces: `'modal form submit-button'` descends from modal to form to submit-button.

**Implicit key matching**: `'playlist-row 12345 like-button'` — if the matched `playlist-row` element has `data-key="12345"`, the key token is consumed without descending. Then `like-button` is found as a child.

**Sigils**:
- `~alias` — Resolves from the `aliases` config (e.g., `~modal` → `[role=dialog]`)
- `@label` — Explicit aria-label match (e.g., `@Close` → `[aria-label="Close"]`)

---

## Configuration

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  browser: 'chromium',
  headed: false,
  timeout: 30000,
  actionTimeout: 5000,
  warnAfter: 500,
  aliases: {
    modal: '[role=dialog]',
    nav: '[role=navigation]',
  },
  reportDir: './scenetest-reports',
  reportFormat: 'html',
})
```

### Actor teams

Define actor credentials in `actors.ts` (array of teams) or `actors/*.ts` (one file per team) next to your config:

```typescript
// actors.ts
export default [
  // Team 1
  {
    user: { id: '1', username: 'alice', email: 'alice@test.com', password: 'pass1' },
    admin: { id: '2', username: 'bob', email: 'bob@test.com', password: 'pass2' },
  },
  // Team 2 (for parallel execution)
  {
    user: { id: '3', username: 'carol', email: 'carol@test.com', password: 'pass3' },
    admin: { id: '4', username: 'dave', email: 'dave@test.com', password: 'pass4' },
  },
]
```

Teams enable parallel scene execution — each scene acquires a team, so scenes using different teams run concurrently without data conflicts.

---

## Text DSL

The text DSL lets you write actions as plain strings — useful for simple flows, code generation, natural-language-to-test pipelines, and debug reproduction scripts.

### Inline `dsl()` method (recommended)

Both declarative and classic driver actors have a `dsl()` method that accepts a multiline string:

**Declarative model:**

```typescript
flow('onboarding flow', ({ actor }) => {
  const user = actor('user')

  user.dsl(`
    openTo /
    see welcome-box
    click continue-button
    see onboarding-step
    typeInto name-input Alice
    click finish-button
  `)

  user.see('dashboard')
})
```

**Classic Driver model:**

```typescript
scene('onboarding flow', async ({ actor }) => {
  const user = await actor('user')

  await user.dsl(`
    openTo /
    see welcome-box
    click continue-button
    see onboarding-step
    typeInto name-input Alice
    click finish-button
  `)

  await user.see('dashboard')
})
```

`dsl()` returns the actor (declarative) or an `ActionChain` (classic driver), so it chains with other methods:

```typescript
// declarative model — all chaining, no await
user
  .openTo('/login')
  .dsl(`
    see login-form
    typeInto email alice@test.com
    typeInto password secret
    click submit
  `)
  .see('dashboard')
```

### `runDsl()` and `runMacro()` — standalone functions

These work with both declarative and classic driver actors:

```typescript
import { runDsl } from '@scenetest/cli'

// Classic driver — await triggers execution
await runDsl(user, [
  'openTo /login',
  'see login-form',
  'typeInto email alice@test.com',
  'typeInto password secret',
  'click submit',
  'see dashboard',
])

// Declarative — just queues actions (await is a no-op)
runDsl(user, [
  'openTo /login',
  'see login-form',
  'typeInto email alice@test.com',
  'click submit',
])
```

**Macros** allow reuse:

```typescript
import { defineMacro, runMacro } from '@scenetest/cli'

defineMacro('login', [
  'openTo /login',
  'see login-form',
  'typeInto email {{email}}',
  'typeInto password {{password}}',
  'click submit',
  'see dashboard',
])

// Works with both declarative and classic driver actors
await runMacro(user, 'login', { email: 'alice@test.com', password: 'secret' })
```
