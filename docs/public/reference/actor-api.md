# Actor API Reference

Complete reference for the `scene()`, `flow()`, `actor()`, and action chain APIs used to write scene specs.

For a gentler introduction, see [Writing Scene Specs](/guides/writing-scene-specs).

## scene

```typescript
scene(name: string, fn: (context: SceneContext) => Promise<void>): void
```

Registers a scene with await-driven sequential orchestration. The callback receives a `SceneContext` with an `actor` function and the assigned `teamIndex`.

```typescript
import { scene } from '@scenetest/cli'

scene('user can update their profile', async ({ actor }) => {
  const user = await actor('primary-learner')
  await user.openTo('/profile')
  await user.see('profile-form')
})
```

## flow

```typescript
flow(name: string, fn: (context: FlowContext) => void): void
```

Registers a scene with reactive concurrent draining. The callback is **synchronous** — all DSL calls queue actions that drain concurrently after the function returns.

```typescript
import { flow } from '@scenetest/cli'

flow('user can update their profile', ({ actor }) => {
  const user = actor('primary-learner')
  user.openTo('/profile')
  user.see('profile-form')
})
```

## actor

```typescript
// In scene() — async, returns ActorHandle
actor(role: string): Promise<ActorHandle>

// In flow() — sync, returns ReactiveActor
actor(role: string): ReactiveActor
```

Returns an actor handle for the given role from the current team. The role must match a key in your [actor team files](/guides/building-teams).

```typescript
// scene model
const user = await actor('primary-learner')
const friend = await actor('existing-friend')

// flow model
const user = actor('primary-learner')
const friend = actor('existing-friend')
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

Waits for an element matching the [selector](#selectors) to become visible, then sets it as the **current scope**. Subsequent actions like `click` and `typeInto` look within this scope.

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
await user.typeInto('search-form query', 'scenetest')   // nested selector
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

### waitFor (flow model only)

```typescript
user.waitFor(message: string): ReactiveActor
```

Blocks the actor's queue until the named message arrives on the message bus. Only available in `flow()` — in `scene()`, use `when()` instead.

```typescript
// flow model
receiver.waitFor('data-ready')
receiver.openTo('/inbox')
receiver.seeText('New message')
```

### dsl

```typescript
user.dsl(text: string): ActionChain | ReactiveActor
```

Queues actions from a multiline text DSL string. Returns the actor (flow) or an `ActionChain` (scene), so it chains with other methods.

```typescript
// scene model
await user.dsl(`
  see login-form
  typeInto email alice@test.com
  typeInto password secret
  click submit
`)

// flow model
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

Navigates from the current scope **up** to an ancestor matching the selector. When called with **no selector** (bare `up`), resets scope to the page root. Useful with [aliases](#aliases) for finding named containers.

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

> In `scene()`, `up` and `prev` are only available on action chains (mid-chain), not directly on the actor handle. In `flow()`, all methods are available directly on the actor.

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
import { when } from '@scenetest/cli'

// When message is received, do action
when(message: string, callback: () => ActionChain | Promise<void>): void

// When action completes, emit message
when(callback: () => ActionChain | Promise<void>, message: string): void
```

Coordinates between actors via a message bus. Combine with `emit` for multi-actor flows:

```typescript
scene('friend request flow', async ({ actor }) => {
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

All selector parameters accept a `Selector` string. Selectors are **space-separated tokens** that resolve to DOM elements.

### Attribute matching

Each token matches against **all** of these attributes simultaneously:

- `aria-label`
- `id`
- `data-testid`
- `data-name`
- `data-key`
- `name`

There is no priority between attributes. If multiple elements match (each via a different attribute), the first one in **DOM order** wins. In practice, `data-testid` is the primary convention for scene specs.

### Nested selectors

Space-separated tokens drill into the DOM. Each token finds a descendant of the previous match:

```typescript
await user.see('sidebar nav-menu settings-link')
// Finds: [data-testid="sidebar"] > ... > [data-testid="nav-menu"] > ... > [data-testid="settings-link"]
```

### Key selectors

If an element has a `data-key` attribute, the next token can match against it without descending into a child:

```typescript
await user.click('playlist-row 12345 like-button')
// playlist-row matches [data-testid="playlist-row"]
// 12345 matches data-key="12345" on the SAME element
// like-button matches [data-testid="like-button"] inside that row
```

This is useful for lists where each row has a unique key.

### Aliases

Configure shorthand selectors in your config with a `~` prefix:

```typescript
// scenetest.config.ts
export default defineConfig({
  baseUrl: 'http://localhost:5173',
  aliases: {
    modal: '[role=dialog]',
    'btn-p': 'button[type=submit], button.primary',
    nav: '[role=navigation]',
  },
})
```

Use them with the `~` prefix:

```typescript
await user.see('~modal')               // matches [role=dialog]
await user.click('~modal ~btn-p')      // matches submit button inside dialog
```

---

## Action Chains (scene model)

In `scene()`, every actor method returns an `ActionChain`. Chains are **thenable** (`PromiseLike<void>`), so they execute when awaited. You can chain multiple actions that run sequentially:

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

### Available on chains only (scene model)

These methods are only available mid-chain, not directly on the actor handle:

- [`up(selector?)`](#up) -- navigate to an ancestor (or bare `up` to page root)
- [`prev()`](#prev) -- return to previous scope

## Reactive actors (flow model)

In `flow()`, every actor method returns the **actor itself**. All methods are chainable and available directly. Scope persists across the actor's entire queue.

```typescript
const user = actor('user')

// All chaining, no await — actions queue for concurrent drain
user
  .openTo('/login')
  .see('login-form')
  .typeInto('email', user.email!)
  .click('submit')
  .see('dashboard')

// waitFor is only available in flow model
user.waitFor('data-ready')
user.see('loaded-content')
```
