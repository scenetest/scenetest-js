# Actor API Reference

Complete reference for the `actor()` the action-chain object, with code examples for both concurrent flow and classic driver. Unless otherwise specified, the two APIs function the same way. [Read here for more information about the two driver modes](/reference/concurrent-and-classic).

## The Driver: `scene()` (or `test()`)

Registers a scene script or test. The callback receives a context object with `actors` provider.

```ts [declarative scene]
// scene-file.spec.ts
import { scene } from '@scenecheck/scenes'

scene('user can update their profile', ({ actor }) => {
  const user1 = actor('primary-learner')
  user1.openTo('/profile')
  user1.see('profile-form')
})
```
```ts [imperative test]
// test-file.spec.ts
import { test } from '@scenecheck/scenes'

test('user can update their profile', ({ actor }) => {
  const user1 = await actor('primary-learner')
  await user1.openTo('/profile')
  await user1.see('profile-form')
})

```

## Actor Registry: `actor()`

Returns an actor handle for the given role from the current team. The role must match a key in your [actor team files](/guides/building-teams). In the concurrent mode you get a `ConcurrentActorHandle`; in sequential mode you get a promise returning a `SequentialActorHandle`.

```typescript [concurrent]
// In scene() (concurrent) — sync, returns ConcurrentActorHandle
actor(role: string): ConcurrentActorHandle

// concurrent model
const user1 = actor('primary-learner')
const friend1 = actor('existing-friend')



```
```typescript [classic]
// In test() (classic driver) — async, returns SequentialActorHandle
actor(role: string): Promise<SequentialActorHandle>

// classic driver model
const user1 = await actor('primary-learner')
const friend1 = await actor('existing-friend')
```

The returned handle extends `ActorConfig`, so you can access the actor's config properties directly:

```typescript [concurrent]
const user = actor('primary-learner')
console.log(user1.role)     // 'primary-learner'
console.log(user1.email)    // from actor config
console.log(user1.page)     // Playwright Page instance
```

---

## Navigation

### openTo

Navigates the actor's browser to the given URL. This performs a full page load (not SPA client-side routing).
The URL is resolved relative to the `baseUrl` in your config.

```typescript [concurrent]
// definition
user1.openTo(url: string): ConcurrentActorHandle

// in-your.spec.ts
user1.openTo('/')
user1.openTo('/settings/profile')
```

---

## Visibility

### see

Waits for an element matching the [selector](/reference/selectors) to become visible, then sets it as the **current scope**. Subsequent actions like `click` and `typeInto` look within this scope.

```typescript [concurrent]
// definition
user1.see(selector: Selector): ConcurrentActorHandle

// in your scene function
user1.see('profile-form')
user1.see('sidebar nav-menu')          // nested: nav-menu inside sidebar
```

Scope is cumulative in a chain:

```typescript [concurrent]
user1
  .see('settings-panel')         // scope: settings-panel
  .see('notification-section')   // scope: notification-section inside settings-panel
  .click('toggle')               // clicks toggle inside notification-section
```

### notSee

Waits for an element matching the selector to **not** be visible (hidden or detached from the DOM). Useful for asserting that something has disappeared.

```typescript [concurrent]
// fn definition
user1.notSee(selector: Selector): ConcurrentActorHandle

// in your spec
user1.click('close-button')
user1.notSee('modal')
```

### seeText

Waits for the given text to be visible anywhere on the page.

```typescript [concurrent]
// definition
user1.seeText(text: string): ConcurrentActorHandle

// in your scene
user1.click('submit-button')
user1.seeText('Changes saved')
```

### seeInView

Waits for an element matching the selector to be visible **within the viewport** — the element must be rendered and within the visible scroll area without needing to scroll. Uses `getBoundingClientRect` to check that the element's bounds intersect the viewport.

```typescript
// fn signature
user1.seeInView(selector: Selector): ConcurrentActorHandle

// in your scene
user1.seeInView('hero-banner')        // visible without scrolling
user1.seeInView('call-to-action')     // check it's above the fold
```

### seeToast

Waits for an element to **appear and then disappear**. Designed for transient UI like toasts, snackbars, and flash notifications.

```typescript
// fn signature
user1.seeToast(selector: Selector): ActionChain

// in your spec
user.click('save-button')
user.seeToast('success-notification')
```

---

## Interaction

### click

Clicks the element matching the selector within the current scope. When called with **no selector** (bare `click`), clicks the current scope element itself.


```typescript [concurrent]
// definition
user1.click(selector?: Selector): ConcurrentActorHandle

// in your scene
user1.click('submit-button')
user1.click('user-card action-menu')   // nested selector

// Bare click — clicks the current scope element
user1.see('notification-item').click() // click the notification itself
```

```markdown [markdown]
// definition
- click selector

// in your scene
user1:
click submit-button
click user-card action-menu   // nested selector

// Bare click — clicks the current scope element
see notification-item
click                         // click the notification itself
```

```typescript [classic]
// definiction
await user1.click(selector?: Selector): ActionChain

// in your scene
await user1.click('submit-button')
await user1.click('user-card action-menu')   // nested selector

// Bare click — clicks the current scope element
await user1.see('notification-item').click() // click the notification itself
```


### typeInto

Clears and types text into the input matching the selector within the current scope.

```typescript [classic]
// fn signature
await user.typeInto(selector: Selector, value: string): ConcurrentActorHandle

// in your test callback
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

Emits a named message to the [message bus](#waitfor) for coordinating between actors.

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

### waitFor

Blocks the actor's queue until the named message arrives on the message bus. Available in both modes and the markdown DSL.

```ts [concurrent]
// definition
user.waitFor(message: string): ConcurrentActorHandle
// in your spec
receiver.waitFor('data-ready')
receiver.openTo('/inbox')
receiver.seeText('New message')
```
```ts [classic]
// definition
void user.waitFor(message: string): ActionChain
// in your spec
await receiver.waitFor('data-ready')
await receiver.openTo('/inbox')
await receiver.seeText('New message')
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

Actors can coordinate via `emit()` and `waitFor()` on the sticky message bus. Both methods are available in both concurrent and classic driver modes.

```typescript [concurrent]
scene('friend request flow', ({ actor }) => {
  const sender = actor('primary-learner')
  const receiver = actor('existing-friend')

  sender.openTo('/friends')
  sender.click('add-friend-button')
  sender.typeInto('friend-search', 'carlos')
  sender.click('send-request')
  sender.emit('request-sent')

  receiver.waitFor('request-sent')
  receiver.see('friend-request-notification')
})
```
```ts [classic]
test('friend request flow', async ({ actor }) => {
  const sender = await actor('primary-learner')
  const receiver = await actor('existing-friend')

  await sender.openTo('/friends')
  await sender.click('add-friend-button')
  await sender.typeInto('friend-search', 'carlos')
  await sender.click('send-request')
  await sender.emit('request-sent')

  await receiver.waitFor('request-sent')
  await receiver.see('friend-request-notification')
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
