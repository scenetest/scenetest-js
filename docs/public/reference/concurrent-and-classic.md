# Concurrent and Classic Mode

Scenecheck has two TypeScript execution models and a plain-text format. All three use the same [actor DSL methods](/reference/actor-api), [selector resolution](/reference/selectors), configuration, and team management. They differ in **syntax and execution model**.

| Style | File | Function | Execution model | Best for |
|-------|------|----------|----------------|----------|
| **Text DSL** | `.spec.md` | Compiles to `scene()` | Concurrent | Simplest way to write a spec with as many actors as you want |
| **Concurrent** | `.spec.ts` | `scene()` | Reactive concurrent draining | Full TypeScript control with automatic concurrency |
| **Classic Driver** | `.spec.ts` | `test()` | Sequential await-driven | Familiar Cypress/Playwright model with explicit control |

> **STATUS:** Both models are implemented. Before 1.0, one will be removed. See the [decision document](/design/scene-vs-flow) for the trade-off analysis. Text DSL `.spec.md` files compile to `scene()`.

---

## Concurrent — scene()

```typescript
import { scene } from '@scenecheck/scenes'

scene('user updates their profile', ({ actor }) => {
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

---

## Classic Driver — test()

```typescript
import { test } from '@scenecheck/scenes'

test('user updates their profile', async ({ actor }) => {
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

---

## How to Tell Them Apart

| | Concurrent — `scene()` | Classic Driver — `test()` |
|---|---------|--------|
| **Import** | `import { scene } from '@scenecheck/scenes'` | `import { test } from '@scenecheck/scenes'` |
| **`actor()` call** | `const user = actor('user')` (sync) | `const user = await actor('user')` |
| **Function signature** | `({ actor }) => { ... }` (no async needed) | `async ({ actor }) => { ... }` |
| **DSL calls need `await`?** | No — calls just queue, execution is automatic | Yes — `await` triggers execution |
| **What DSL methods return** | The actor itself (chainable, not thenable) | `ActionChain` (thenable, disposable) |
| **Where scope lives** | On the actor (persists through the entire queue) | On the chain (resets at each `await`) |
| **Multi-actor concurrency** | Automatic — all actors drain concurrently | Explicit `Promise.all()` |
| **`if(selector, cb)`** | Persistent one-shot monitor, polls for **all subsequent actions** | Watcher that polls during actions, **cleared after each `await`** |
| **`waitFor(message)`** | Available — blocks actor's queue until bus message arrives | Available — blocks until bus message arrives |

### Critical: DO NOT mix the two models

- In a `test()`, you MUST `await` DSL calls. Without `await`, the actions never execute and the test silently does nothing.
- In a `scene()`, you MUST NOT `await` anything. Actor creation is synchronous, DSL calls are synchronous. The entire body is pure declaration — no `async`, no `await`.

---

## Multi-Actor Examples

### Concurrent — concurrent by default

```typescript
scene('two users can chat', ({ actor }) => {
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

### Classic Driver — sequential by default, explicit concurrency

```typescript
test('two users can chat', async ({ actor }) => {
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

---

## Multi-Actor Coordination

### Both modes use `emit()` and `waitFor()`

```typescript
scene('sender and receiver', ({ actor }) => {
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

### Classic Driver uses `emit()` and `waitFor()`

```typescript
import { test } from '@scenecheck/scenes'

test('sender and receiver', async ({ actor }) => {
  const sender = await actor('sender')
  const receiver = await actor('receiver')

  await sender.openTo('/login')
  // ... login flow ...
  await sender.emit('sender-ready')
  await sender.see('compose').typeInto('body', 'Hello!').click('send')

  // waitFor is available in classic mode too — it returns a promise
  // that resolves when the named message arrives on the bus.
  await receiver.waitFor('sender-ready')
  await receiver.openTo('/inbox')
  await receiver.seeText('New message')
})
```

---

## Conditional Monitors: if()

Both models support `if()` but with different lifecycles:

**Classic Driver:** Watcher polls during actions, cleared after each `await`.

```typescript
// classic driver model
user.if('welcome-modal', async () => {
  await user.click('dismiss')
})
await user.see('dashboard') // if() polls during this action, clears after
```

**Concurrent:** Persistent one-shot monitor, polls during all subsequent actions.

```typescript
// concurrent model
user.if('welcome-modal', a => a.click('dismiss'))
user.see('dashboard')
user.openTo('/profile')
// ^ The monitor polls during BOTH actions above.
//   Fires inline when matched, then stops (one-shot).
```

---

## Action Chains (classic driver)

In `test()`, every actor method returns an `ActionChain`. Chains are **thenable** (`PromiseLike<void>`), so they execute when awaited:

```typescript
await user
  .see('form')
  .typeInto('email', 'test@example.com')
  .click('submit')
```

Scope set by `see` carries through the chain. `up()` and `prev()` are available mid-chain only (not directly on the actor handle).

## Reactive Actors (concurrent)

In `scene()`, every actor method returns the **actor itself**. All methods are chainable and available directly. Scope persists across the actor's entire queue:

```typescript
const user = actor('user')

user
  .openTo('/login')
  .see('login-form')
  .typeInto('email', user.email!)
  .click('submit')
  .see('dashboard')

// waitFor is available in both models
user.waitFor('data-ready')
user.see('loaded-content')
```
