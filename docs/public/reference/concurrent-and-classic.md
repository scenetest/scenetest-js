# TypeScript Scenes & Playwright Specs

Scenetest has three authoring surfaces, at increasing distance from the core scene runtime:

1. **Markdown scenes** (`.spec.md`) — the primary surface. Write specs in a human-readable Markdown format that compiles to TypeScript scenes at runtime. See the [Markdown Spec Reference](/reference/text-dsl).
2. **TypeScript scenes** — `scene()`. The same scene runtime, written directly in TypeScript. For custom setup/teardown or logic that Markdown can't express.
3. **Playwright specs** — `test()`. Standard sequential Playwright-style specs using Scenetest actor handles. For compatibility and migration from Playwright/Cypress.

Surfaces 1 and 2 are inside the Scenetest scene runtime — they build per-actor queues that drain concurrently. Surface 3 is the familiar await-driven sequential model.

This page documents surfaces 2 and 3. All three surfaces use the same [actor methods](/reference/text-dsl), [selector resolution](/reference/selectors), configuration, and team management.

---

## How We Got Here

We started with the other half of Scenetest: the **inline checks**. `should()`, `failed()`, and `serverCheck()` are assertion functions that live directly inside your application code — in components, mutation callbacks, and effects — and report results to an observer panel in dev mode. (The Vite plugin strips them all from your production bundle.)

Once we had inline checks handling the deep validation — state consistency, cache correctness, client-server agreement — we realized that **scene specs could be so much simpler**. The spec doesn't need to evaluate or compare or extract data. It just needs to describe who does what and what they expect.

So we asked: how simple can we _possibly_ make this?

What we ended up with was the Markdown format:

```scenetest
# friend request flow

alice:
- openTo /search
- typeInto search [bob.username]
- click send-request

bob:
- openTo /notifications
- click accept
- click sidebar-menu chats-page-link
- see chat-list-item [alice.key]

alice:
- see alert-friend-accepted
- click
- seeText [bob.username]
```

As you must have guessed, the Markdown is just another way of logging steps that get added to the actor queue. So we also have a pure TypeScript way of writing to that same queue:

```typescript
scene('friend request flow', ({ actor }) => {
  const alice = actor('alice')
  const bob = actor('bob')

  alice.openTo('/search')
    .typeInto('search', bob.username)
    .click('send-request')

  bob.openTo('/notifications')
    .click('accept')
    .click('sidebar-menu chats-page-link')
    .see(`chat-list-item ${alice.key}`)

  alice.see('alert-friend-accepted')
    .click()
    .seeText(bob.username)
})
```

Together, these both represent a **scene**: a set of queues, with each queue belonging to one actor and representing one person's experience using the app — their device, their login, their actions. The simplified approach makes it flexible to write, whether in Markdown or in TypeScript, providing big benefits for DX and making it easy for models to write scene specs.

But ultimately, it's all Playwright under the hood. So if you want to opt out of the actor-scene runtime and use Playwright directly, you can do that too — that's what `test()` is for.

---

## TypeScript Scenes — scene()

```typescript
import { scene } from '@scenetest/scenes'

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

**How it works:** The entire function body is **synchronous declaration**. `actor()` returns a handle immediately (config is resolved, browser launches later). Method calls push to a persistent queue on the actor and return the actor itself. Nothing executes during the function body. After it returns, browsers launch in parallel, then all actors drain their queues concurrently. Each actor advances through its own queue as fast as the DOM allows.

**When to use:** When you need custom setup/teardown logic, TypeScript variables, or anything the Markdown format can't express. `scene()` is a direct 1:1 translation from the Markdown format — they produce identical results at runtime.

### Code-only methods

These methods are only available in TypeScript specs (both `scene()` and `test()`), not in Markdown.

#### do()

Executes a custom function with access to the actor's Playwright `Page`. Use this as an escape hatch when built-in methods don't cover your needs.

```typescript [scene()]
user.do(async (page) => {
  await page.evaluate(() => localStorage.clear())
})
```
```typescript [test()]
await user.do(async (page) => {
  await page.evaluate(() => localStorage.clear())
})
```

---

## Playwright Specs — test()

```typescript
import { test } from '@scenetest/scenes'

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

**How it works:** Each method call (`.see()`, `.click()`, etc.) pushes an action onto a chain. The chain is inert until you `await` it, at which point all queued actions execute sequentially. Scope resets between `await` boundaries — each `await` creates a new chain.

**When to use:** When migrating from Playwright/Cypress patterns, or for single-actor flows where you want explicit step-by-step control. This is the closest thing to raw Playwright, but with Scenetest's actor handles, selector resolution, and team management.

---

## Quick Comparison

| | TypeScript Scenes — `scene()` | Playwright Specs — `test()` |
|---|---------|--------|
| **Import** | `import { scene } from '@scenetest/scenes'` | `import { test } from '@scenetest/scenes'` |
| **`actor()` call** | `const user = actor('user')` (sync) | `const user = await actor('user')` |
| **Function signature** | `({ actor }) => { ... }` (no async needed) | `async ({ actor }) => { ... }` |
| **DSL calls need `await`?** | No — calls just queue, execution is automatic | Yes — `await` triggers execution |
| **What methods return** | The actor itself (chainable, not thenable) | `ActionChain` (thenable, disposable) |
| **Where scope lives** | On the actor (persists through the entire queue) | On the chain (resets at each `await`) |
| **Multi-actor concurrency** | Automatic — all actors drain concurrently | Explicit `Promise.all()` |
| **`if(selector, cb)`** | Persistent one-shot monitor, polls for **all subsequent actions** | Watcher that polls during actions, **cleared after each `await`** |
| **`waitFor(message)`** | Available — blocks actor's queue until bus message arrives | Available — blocks until bus message arrives |

### Critical: DO NOT mix the two models

- In a `test()`, you MUST `await` method calls. Without `await`, the actions never execute and the test silently does nothing.
- In a `scene()`, you MUST NOT `await` anything. Actor creation is synchronous, method calls are synchronous. The entire body is pure declaration — no `async`, no `await`.

---

## Multi-Actor Examples

### TypeScript scenes — concurrent by default

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

### Playwright specs — sequential by default, explicit concurrency

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

### Playwright specs use `emit()` and `waitFor()`

```typescript
import { test } from '@scenetest/scenes'

test('sender and receiver', async ({ actor }) => {
  const sender = await actor('sender')
  const receiver = await actor('receiver')

  await sender.openTo('/login')
  // ... login flow ...
  await sender.emit('sender-ready')
  await sender.see('compose').typeInto('body', 'Hello!').click('send')

  // waitFor is available in test() too — it returns a promise
  // that resolves when the named message arrives on the bus.
  await receiver.waitFor('sender-ready')
  await receiver.openTo('/inbox')
  await receiver.seeText('New message')
})
```

---

## Conditional Monitors: if()

Both models support `if()` but with different lifecycles:

**Playwright specs:** Watcher polls during actions, cleared after each `await`.

```typescript
// test() model
user.if('welcome-modal', async () => {
  await user.click('dismiss')
})
await user.see('dashboard') // if() polls during this action, clears after
```

**TypeScript scenes:** Persistent one-shot monitor, polls during all subsequent actions.

```typescript
// scene() model
user.if('welcome-modal', a => a.click('dismiss'))
user.see('dashboard')
user.openTo('/profile')
// ^ The monitor polls during BOTH actions above.
//   Fires inline when matched, then stops (one-shot).
```

---

## Action Chains (test())

In `test()`, every actor method returns an `ActionChain`. Chains are **thenable** (`PromiseLike<void>`), so they execute when awaited:

```typescript
await user
  .see('form')
  .typeInto('email', 'test@example.com')
  .click('submit')
```

Scope set by `see` carries through the chain. `up()` and `prev()` are available mid-chain only (not directly on the actor handle).

## Reactive Actors (scene())

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

---

## Which Should I Use?

- **Markdown scenes** — Start here. Your default for writing new specs or converting old ones. If it doesn't let you do what you want to do, and you can't accomplish it with `emit`/`waitFor`, let us know!
- **TypeScript scenes** (`scene()`) — If you need TypeScript for custom logic, reach for this; it will be a direct translation from the Markdown format.
- **Playwright specs** (`test()`) — If you're coming from Playwright/Cypress and have specs that check for very specific multi-actor timing issues where the async/await logic is required to reproduce a certain error condition, `test()` is here for you. `emit`/`waitFor` coordination is available in both modes.
