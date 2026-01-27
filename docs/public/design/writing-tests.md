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
| "User can log in and update their profile" | Scene spec file (`scenes/*.spec.ts`) | QA, PM, or developer | `user.openTo('/login')` ... `user.click('submit')` |
| "Profile data should be loaded before render" | Inline assertion in component | Component author | `should('profile loaded', profile !== undefined)` |
| "Form should not submit with empty name" | Inline assertion in submit handler | Feature developer | `failed('empty name submitted', { name })` |
| "After mutation, cache matches server" | Multi-context assertion (future) | Feature developer | `assert({ title: '...', serverFn, withData })` |

---

## Two authoring models: scene() and flow()

There are two ways to write spec files. Both use the same actor DSL methods (`see`, `click`, `typeInto`, etc.) and the same selector resolution, configuration, and team management. They differ in **execution model**.

> **STATUS: Both models are implemented. We are evaluating which to keep long-term. See `docs/public/design/scene-vs-flow.md` for the trade-off analysis. Before 1.0, one will be removed.**

### scene() — await-driven sequential orchestration

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

### flow() — reactive concurrent draining

```typescript
import { flow } from '@scenetest/cli'

flow('user updates their profile', async ({ actor }) => {
  const user = await actor('user')

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

**How it works:** DSL calls are **declarations** — they push to a persistent queue on the actor and return the actor itself. Nothing executes during the function body. After the function returns, all actors drain their queues concurrently. Each actor advances through its own queue as fast as the DOM allows.

**When to use:** Multi-actor scenes (concurrency is automatic), or when you want to write specs without thinking about timing. `see`/`seeText` naturally poll for DOM state, so cross-actor sync happens through the application, not through `await` ordering.

### How to tell them apart

| | scene() | flow() |
|---|---------|--------|
| **Import** | `import { scene } from '@scenetest/cli'` | `import { flow } from '@scenetest/cli'` |
| **DSL calls need `await`?** | Yes — `await` triggers execution | No — calls just queue, execution is automatic |
| **What DSL methods return** | `ActionChain` (thenable, disposable) | The actor itself (chainable, not thenable) |
| **Where scope lives** | On the chain (resets at each `await`) | On the actor (flows through the entire queue) |
| **Multi-actor concurrency** | Explicit `Promise.all()` | Automatic — all actors drain concurrently |
| **`if(selector, cb)`** | Watcher that polls during actions, **cleared after each `await`** | Persistent one-shot monitor, polls for **all subsequent actions** |
| **`waitFor(message)`** | Not available (use `when()`) | Available — blocks actor's queue until bus message arrives |

### Critical: DO NOT mix the two models

- In a `scene()`, you MUST `await` DSL calls. Without `await`, the actions never execute and the scene silently does nothing.
- In a `flow()`, you MUST NOT `await` DSL calls. The actor is not thenable — `await` would resolve to the actor object and skip all queued actions.
- The only `await` in a `flow()` body should be `await actor('role')` (creating actors requires async browser setup).

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

### scene() — sequential by default, explicit concurrency

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

### flow() — concurrent by default, explicit synchronization only when needed

```typescript
flow('two users can chat', async ({ actor }) => {
  const alice = await actor('alice')
  const bob = await actor('bob')

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

**scene() uses `when()` and `emit()`:**

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

**flow() uses `emit()` and `waitFor()` (but often doesn't need them):**

```typescript
import { flow } from '@scenetest/cli'

flow('sender and receiver', async ({ actor }) => {
  const sender = await actor('sender')
  const receiver = await actor('receiver')

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

**scene():** Watcher polls during actions, cleared after each `await`.

```typescript
// scene model
user.if('welcome-modal', async () => {
  await user.click('dismiss')
})
await user.see('dashboard') // if() polls during this action, clears after
```

**flow():** Persistent one-shot monitor, polls during all subsequent actions.

```typescript
// flow model
user.if('welcome-modal', a => a.click('dismiss'))
user.see('dashboard')
user.openTo('/profile')
// ^ The monitor polls during BOTH actions above.
//   Fires inline when matched, then stops (one-shot).
```

---

## Actor DSL Methods

These methods are available on actors in both `scene()` and `flow()` models:

| Method | Description |
|--------|-------------|
| `openTo(url)` | Navigate to URL (full page load) |
| `see(selector)` | Wait for element visible, set as current scope |
| `notSee(selector)` | Wait for element hidden/detached |
| `seeText(text)` | Wait for text visible on page |
| `seeToast(selector)` | Wait for element to appear then disappear |
| `click(selector)` | Click within current scope |
| `typeInto(selector, value)` | Fill input within current scope |
| `check(selector)` | Check checkbox |
| `select(selector, value)` | Select dropdown option |
| `wait(ms)` | Wait milliseconds |
| `emit(message)` | Emit to message bus (for multi-actor coordination) |
| `do(fn)` | Execute custom function with Playwright page |
| `up(selector)` | Navigate to ancestor matching selector |
| `prev()` | Return to previous scope |
| `scrollToBottom()` | Scroll current scope or page to bottom |
| `if(selector, callback)` | Conditional monitor (see "Conditional monitors" above) |
| `warnIf(selector, message)` | Script warning (persists across scene/flow) |

**In scene():** Methods return an `ActionChain` that is chainable and thenable (await the chain to execute). `if` and `warnIf` return void.

**In flow():** Methods return the actor itself (chainable, not thenable). `if`, `warnIf` return void. Additionally, `waitFor(message)` is available to block the actor's queue until a bus message arrives.

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

Scenes can also be written as string arrays for simpler flows:

```typescript
import { runDsl } from '@scenetest/cli'

await runDsl(user, [
  'openTo /login',
  'see login-form',
  'typeInto email alice@test.com',
  'typeInto password secret',
  'click submit',
  'see dashboard',
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

await runMacro(user, 'login', { email: 'alice@test.com', password: 'secret' })
```
