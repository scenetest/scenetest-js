# Actor API Reference

Complete reference for the `scene()`, `test()`, `actor()`, and action chain APIs used to write scene specs.

Scenecheck has three authoring styles — **Concurrent (ts)** using `scene()`, **Text DSL (md)** using `.spec.md` files, and **Classic Driver (ts)** using `test()`. This reference covers the TypeScript APIs. For the text DSL format, see [Writing Scene Specs](/guides/writing-scene-specs).

## scene (Concurrent)

```typescript
scene(name: string, fn: (context: SceneContext) => void): void
```

Registers a scene with reactive concurrent draining. The callback is **synchronous** — all DSL calls queue actions that drain concurrently after the function returns. This is the **native model** for Scenecheck.

```typescript
import { scene } from '@scenecheck/scenes'

scene('user can update their profile', ({ actor }) => {
  const user = actor('primary-learner')
  user.openTo('/profile')
  user.see('profile-form')
})
```

## test (Classic Driver)

```typescript
test(name: string, fn: (context: SceneContext) => Promise<void>): void
```

Registers a scene with await-driven sequential orchestration. The callback receives a `SceneContext` with an `actor` function and the assigned `teamIndex`. This is the **compatibility model** for those coming from Playwright or Cypress.

```typescript
import { test } from '@scenecheck/scenes'

test('user can update their profile', async ({ actor }) => {
  const user = await actor('primary-learner')
  await user.openTo('/profile')
  await user.see('profile-form')
})
```

## actor

```typescript
// In scene() (concurrent) — sync, returns ConcurrentActorHandle
actor(role: string): ConcurrentActorHandle

// In test() (classic driver) — async, returns SequentialActorHandle
actor(role: string): Promise<SequentialActorHandle>
```

Returns an actor handle for the given role from the current team. The role must match a key in your [actor team files](/guides/building-teams).

```typescript
// concurrent model
const user = actor('primary-learner')
const friend = actor('existing-friend')

// classic driver model
const user = await actor('primary-learner')
const friend = await actor('existing-friend')
```

The returned handle extends `ActorConfig`, so you can access the actor's config properties directly:

```typescript
const user = await actor('primary-learner')
console.log(user.role)     // 'primary-learner'
console.log(user.email)    // from actor config
console.log(user.page)     // Playwright Page instance
```

---

## Navigation

### openTo

```typescript
user.openTo(url: string): ActionChain
```

Navigates the actor's browser to the given URL. This performs a full page load (not SPA client-side routing). The URL is resolved relative to the `baseUrl` in your config.

```typescript
await user.openTo('/')
await user.openTo('/settings/profile')
```

---

## Visibility

### see

```typescript
user.see(selector: Selector): ActionChain
```

Waits for an element matching the [selector](/reference/selectors) to become visible, then sets it as the **current scope**. Subsequent actions like `click` and `typeInto` look within this scope.

```typescript
await user.see('profile-form')
await user.see('sidebar nav-menu')          // nested: nav-menu inside sidebar
```

Scope is cumulative in a chain:

```typescript
await user
  .see('settings-panel')         // scope: settings-panel
  .see('notification-section')   // scope: notification-section inside settings-panel
  .click('toggle')               // clicks toggle inside notification-section
```

### notSee

```typescript
user.notSee(selector: Selector): ActionChain
```

Waits for an element matching the selector to **not** be visible (hidden or detached from the DOM). Useful for asserting that something has disappeared.

```typescript
await user.click('close-button')
await user.notSee('modal')
```

### seeText

```typescript
user.seeText(text: string): ActionChain
```

Waits for the given text to be visible anywhere on the page.

```typescript
await user.click('submit-button')
await user.seeText('Changes saved')
```

### seeInView

```typescript
user.seeInView(selector: Selector): ActionChain
```

Waits for an element matching the selector to be visible **within the viewport** — the element must be rendered and within the visible scroll area without needing to scroll. Uses `getBoundingClientRect` to check that the element's bounds intersect the viewport.

```typescript
await user.seeInView('hero-banner')        // visible without scrolling
await user.seeInView('call-to-action')     // check it's above the fold
```

### seeToast

```typescript
user.seeToast(selector: Selector): ActionChain
```

Waits for an element to **appear and then disappear**. Designed for transient UI like toasts, snackbars, and flash notifications.

```typescript
await user.click('save-button')
await user.seeToast('success-notification')
```

---

## Interaction

### click

```typescript
user.click(selector?: Selector): ActionChain
```

Clicks the element matching the selector within the current scope. When called with **no selector** (bare `click`), clicks the current scope element itself.

```typescript
await user.click('submit-button')
await user.click('user-card action-menu')   // nested selector

// Bare click — clicks the current scope element
await user.see('notification-item').click() // click the notification itself
```

### typeInto

```typescript
user.typeInto(selector: Selector, value: string): ActionChain
```

Clears and types text into the input matching the selector within the current scope.

```typescript
await user.typeInto('email-input', 'alice@example.com')
await user.typeInto('search-form query', 'scenecheck')   // nested selector
```

### check

```typescript
user.check(selector: Selector): ActionChain
```

Checks a checkbox matching the selector within the current scope.

```typescript
await user.check('terms-checkbox')
await user.check('settings-form notifications-toggle')
```

### select

```typescript
user.select(selector: Selector, value: string): ActionChain
```

Selects an option by value in a dropdown matching the selector within the current scope.

```typescript
await user.select('country-dropdown', 'us')
await user.select('settings timezone-select', 'America/New_York')
```

---

## Control Flow

### wait

```typescript
user.wait(ms: number): ActionChain
```

Pauses for the given number of milliseconds. Use sparingly -- prefer `see` or `seeText` to wait for specific conditions.

```typescript
await user.click('trigger-animation')
await user.wait(500)
await user.see('animation-result')
```

### emit

```typescript
user.emit(message: string): ActionChain
```

Emits a named message to the [message bus](#when) for coordinating between actors.

```typescript
await user.click('send-friend-request')
await user.emit('friend-request-sent')
```

### do

```typescript
user.do(fn: (page: Page) => Promise<void>): ActionChain
```

Executes a custom function with access to the actor's Playwright `Page`. Use this as an escape hatch when built-in methods don't cover your needs.

```typescript
await user.do(async (page) => {
  await page.evaluate(() => localStorage.clear())
})
```

### waitFor (concurrent model only)

```typescript
user.waitFor(message: string): ConcurrentActorHandle
```

Blocks the actor's queue until the named message arrives on the message bus. Only available in `scene()` (concurrent model) — in `test()` (classic driver), use `when()` instead.

```typescript
// concurrent model
receiver.waitFor('data-ready')
receiver.openTo('/inbox')
receiver.seeText('New message')
```

### dsl

```typescript
user.dsl(text: string): ActionChain | ConcurrentActorHandle
```

Queues actions from a multiline text DSL string. Returns the actor (concurrent) or an `ActionChain` (classic driver), so it chains with other methods.

```typescript
// classic driver model
await user.dsl(`
  see login-form
  typeInto email alice@test.com
  typeInto password secret
  click submit
`)

// concurrent model
user.dsl(`
  see login-form
  typeInto email alice@test.com
  click submit
`).see('dashboard')
```

---

## Scope Navigation

Actions like `see` set a **scope** -- a DOM element that subsequent actions search within. Scope navigation lets you move around the DOM tree during a chain.

### up

```typescript
chain.up(selector?: Selector): ActionChain
```

Navigates from the current scope **up** to an ancestor matching the selector. When called with **no selector** (bare `up`), resets scope to the page root. Useful with [aliases](/reference/selectors) for finding named containers.

```typescript
await user
  .see('submit-button')
  .up('~form-container')         // go up to an ancestor matching alias
  .see('error-message')          // look for error-message within that ancestor

// Bare up — reset to page root
await user.up()                  // scope → page (clears all scope)
await user.see('other-section')  // search from page root
```

### prev

```typescript
chain.prev(): ActionChain
```

Returns to the **previous scope** before the last `see` or `up` changed it.

```typescript
await user
  .see('first-section')          // scope: first-section
  .see('nested-item')            // scope: nested-item inside first-section
  .prev()                        // scope: first-section again
  .click('other-button')         // clicks within first-section
```

> In the classic driver model (`test()`), `up` and `prev` are only available on action chains (mid-chain), not directly on the actor handle. In the concurrent model (`scene()`), all methods are available directly on the actor.

---

## Conditionals

### if

```typescript
user.if(selector: Selector, callback: () => Promise<void>): void
```

Registers a **conditional watcher**. If the selector becomes visible during the next awaited action, the callback executes inline before continuing. Watchers are cleared after each `await`.

```typescript
user.if('welcome-modal', async () => {
  await user.click('dismiss-welcome')
})
await user.openTo('/dashboard')    // if welcome-modal appears, dismisses it
```

This is not an assertion -- it handles optional UI that may or may not appear (onboarding modals, cookie banners, feature announcements).

### warnIf

```typescript
user.warnIf(selector: Selector, message: string): void
```

Registers a **script warning**. If the selector becomes visible during any subsequent action, a warning is recorded but the scene continues. Unlike `if`, these persist for the entire scene.

```typescript
user.warnIf('welcome-modal', 'user has dismiss flag -- should not see welcome')
await user.openTo('/dashboard')
await user.see('main-content')
```

Warnings appear in the scene report and indicate unexpected paths that aren't failures.

---

## Multi-Actor Coordination

### when

```typescript
import { when } from '@scenecheck/scenes'

// When message is received, do action
when(message: string, callback: () => ActionChain | Promise<void>): void

// When action completes, emit message
when(callback: () => ActionChain | Promise<void>, message: string): void
```

Coordinates between actors via a message bus. Combine with `emit` for multi-actor scenes:

```typescript
test('friend request flow', async ({ actor }) => {
  const sender = await actor('primary-learner')
  const receiver = await actor('existing-friend')

  // When the request is sent, receiver checks for it
  when('request-sent', () => receiver.see('friend-request-notification'))

  await sender.openTo('/friends')
  await sender.click('add-friend-button')
  await sender.typeInto('friend-search', 'carlos')
  await sender.click('send-request')
  await sender.emit('request-sent')
})
```

---

## Selectors

For selector syntax, see the [Selectors reference](/reference/selectors).

---

## Action Chains and Reactive Actors

In `test()` (classic driver), every actor method returns an `ActionChain`. Chains are **thenable** (`PromiseLike<void>`), so they execute when awaited. You can chain multiple actions that run sequentially:

```typescript
// These are equivalent:
await user.see('form')
await user.typeInto('email', 'test@example.com')
await user.click('submit')

// Chained:
await user
  .see('form')
  .typeInto('email', 'test@example.com')
  .click('submit')
```

Chains queue actions and execute them in order when the promise settles. Scope set by `see` carries through the chain.

### Available on chains only (classic driver model)

These methods are only available mid-chain, not directly on the actor handle:

- [`up(selector?)`](#up) -- navigate to an ancestor (or bare `up` to page root)
- [`prev()`](#prev) -- return to previous scope

For details on action chains vs concurrent actors, see the [Concurrent and Classic Mode reference](/reference/concurrent-and-classic).
