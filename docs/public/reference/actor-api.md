# Actor API Reference

Complete reference for the actor handle and action chain, with code examples for both TypeScript scenes (scene()) and Playwright specs (test()). Unless otherwise specified, the two APIs function the same way. [Read here for more information about the two driver modes](/reference/concurrent-and-classic).

## Register the Spec: `scene()` (or `test()`)

Registers a TypeScript scene or a Playwright spec. The callback receives a context object with an `actor` provider.

```ts [scene()]
// scene-file.spec.ts
import { scene } from '@scenetest/scenes'

scene('user can update their profile', ({ actor }) => {
  const user1 = actor('primary-learner')
  user1.openTo('/profile')
  user1.see('profile-form')
})
```
```ts [test()]
// test-file.spec.ts
import { test } from '@scenetest/scenes'

test('user can update their profile', async ({ actor }) => {
  const user1 = await actor('primary-learner')
  await user1.openTo('/profile')
  await user1.see('profile-form')
})
```

## Actor Registry: `actor()`

Returns an actor handle for the given role from the current team. The role must match a key in your [actor team files](/guides/building-teams). In scene() you get a `ConcurrentActorHandle`; in test() you get a promise resolving to a `SequentialActorHandle`.

```typescript [scene()]
actor(role: string): ConcurrentActorHandle

const user1 = actor('primary-learner')
const friend1 = actor('existing-friend')
```
```typescript [test()]
async actor(role: string): Promise<SequentialActorHandle>

const user1 = await actor('primary-learner')
const friend1 = await actor('existing-friend')
```

The returned handle extends `ActorConfig`, so you can access the actor's config properties directly:

```typescript
console.log(user1.role)     // 'primary-learner'
console.log(user1.email)    // from actor config
console.log(user1.page)     // Playwright Page instance
```


## Navigation

### openTo

```typescript
user.openTo(url: string): ConcurrentActorHandle | ActionChain
```

Navigates the actor's browser to the given URL. This performs a full page load (not SPA client-side routing). The URL is resolved relative to the `baseUrl` in your config.

```typescript [scene()]
user.openTo('/')
    .see('landing-page')
user.openTo('/settings/profile')
```
```typescript [test()]
await user.openTo('/')
await user.see('landing-page')
await user.openTo('/settings/profile')
```

### reload

```typescript
user.reload(): ConcurrentActorHandle | ActionChain
```

Reloads the current page and resets scope to the page root. Useful for testing that server-side state persists across page loads.

```typescript [scene()]
user.click('save-button')
user.reload()
user.see('saved-content')    // verify state survived reload
```
```typescript [test()]
await user.click('save-button')
await user.reload()
await user.see('saved-content')
```

### goBack

```typescript
user.goBack(): ConcurrentActorHandle | ActionChain
```

Navigates back in browser history (like clicking the browser's back button). Resets scope to the page root.

```typescript [scene()]
user.openTo('/step-1')
user.click('next-button')
user.see('step-2-form')
user.goBack()
user.see('step-1-form')    // back to previous page
```
```typescript [test()]
await user.openTo('/step-1')
await user.click('next-button')
await user.see('step-2-form')
await user.goBack()
await user.see('step-1-form')
```

### goForward

```typescript
user.goForward(): ConcurrentActorHandle | ActionChain
```

Navigates forward in browser history (like clicking the browser's forward button). Resets scope to the page root.

```typescript [scene()]
user.goBack()
user.goForward()
user.see('current-page')
```
```typescript [test()]
await user.goBack()
await user.goForward()
await user.see('current-page')
```

### switchDevice

```typescript
user.switchDevice(device?: string): ConcurrentActorHandle | ActionChain
```

Closes the actor's current browser context and opens a new one, simulating a device switch. If a `device` name is provided, the new context uses that device's emulation profile (viewport, user agent). If omitted, the next device from the [device rotation](/reference/devices) is used (or a default desktop context if no rotation is configured).

The actor keeps its identity (role, credentials, config) but gets a fresh browser — no cookies, no localStorage, no session. This is the point: test that your app handles a new device picking up where the old one left off.

```typescript [scene()]
scene('cross-device sync', ({ actor }) => {
  const user = actor('primary-learner')

  user.openTo('/notes')
  user.typeInto('note-editor', 'Hello from laptop')
  user.click('save-button')
  user.switchDevice('iPhone 14')
  user.openTo('/notes')
  user.seeText('Hello from laptop')    // server state survived device switch
})
```
```typescript [test()]
test('cross-device sync', async ({ actor }) => {
  const user = await actor('primary-learner')

  await user.openTo('/notes')
  await user.typeInto('note-editor', 'Hello from laptop')
  await user.click('save-button')
  await user.switchDevice('iPhone 14')
  await user.openTo('/notes')
  await user.seeText('Hello from laptop')
})
```

#### Built-in devices

| Category | Names |
|----------|-------|
| Mobile | `iPhone 14`, `iPhone 12`, `Pixel 7`, `Galaxy S9+` |
| Tablet | `iPad Pro 11`, `iPad Mini` |
| Desktop | `Desktop 1920x1080`, `Desktop 1366x768`, `Desktop 1440x900`, `Desktop 2560x1440` |

These are pulled from Playwright's device descriptors (with custom desktop profiles added). The `builtinDevices` array and `DeviceProfile` type are exported from `@scenetest/scenes` if you need to inspect or extend them. To use a custom device pool, configure it via `devices` in your [config](/design/cli-v2#9-configuration-reference).

### scrollToBottom

```typescript
user.scrollToBottom(): ConcurrentActorHandle | ActionChain
```

Scrolls the current scope (or the nearest scrollable ancestor) to the bottom.

```typescript [scene()]
user.see('message-list').scrollToBottom().see('oldest-message')
```
```typescript [test()]
await user.see('message-list').scrollToBottom().see('oldest-message')
```

## Visibility

### see

```typescript
user.see(selector: Selector): ConcurrentActorHandle | ActionChain
```

Waits for an element matching the [selector](/reference/selectors) to become visible, then sets it as the **current scope**. Subsequent actions like `click` and `typeInto` look within this scope.

```typescript [scene()]
user.see('profile-form')
user.see('sidebar nav-menu')          // nested: nav-menu inside sidebar
```
```typescript [test()]
await user.see('profile-form')
await user.see('sidebar nav-menu')    // nested: nav-menu inside sidebar
```

Scope is cumulative in a chain:

```typescript [scene()]
user
  .see('settings-panel')         // scope: settings-panel
  .see('notification-section')   // scope: notification-section inside settings-panel
  .click('toggle')               // clicks toggle inside notification-section
```
```typescript [test()]
await user
  .see('settings-panel')         // scope: settings-panel
  .see('notification-section')   // scope: notification-section inside settings-panel
  .click('toggle')               // clicks toggle inside notification-section
```

### seeInView

```typescript
user.seeInView(selector: Selector): ConcurrentActorHandle | ActionChain
```

Like `see`, but additionally verifies the element is within the current viewport bounds without needing to scroll. Uses `getBoundingClientRect` to check intersection with the viewport.

```typescript [scene()]
user.seeInView('hero-banner')        // visible without scrolling
user.seeInView('call-to-action')     // check it's above the fold
```
```typescript [test()]
await user.seeInView('hero-banner')
await user.seeInView('call-to-action')
```

### notSee

```typescript
user.notSee(selector: Selector): ConcurrentActorHandle | ActionChain
```

Waits for an element matching the selector to **not** be visible (hidden or detached from the DOM). Useful for asserting that something has disappeared.

```typescript [scene()]
user.click('close-button')
user.notSee('modal')
```
```typescript [test()]
await user.click('close-button')
await user.notSee('modal')
```

### seeText

```typescript
user.seeText(text: string): ConcurrentActorHandle | ActionChain
```

Waits for the given text to be visible anywhere on the page.

```typescript [scene()]
user.click('submit-button')
user.seeText('Changes saved')
```
```typescript [test()]
await user.click('submit-button')
await user.seeText('Changes saved')
```

### seeToast

```typescript
user.seeToast(selector: Selector): ConcurrentActorHandle | ActionChain
```

Waits for an element to **appear and then disappear**. Designed for transient UI like toasts, snackbars, and flash notifications.

```typescript [scene()]
user.click('save-button')
  .seeToast('success-notification')
  .click('delete-button')
```
```typescript [test()]
await user.click('save-button')
  .seeToast('success-notification')
await user.click('delete-button')
```

## Interaction

### click

```typescript
user.click(selector?: Selector): ConcurrentActorHandle | ActionChain
```

Clicks the element matching the selector within the current scope. When called with **no selector** (bare `click`), clicks the current scope element itself.

In **keyboard mode**, this becomes Tab-to-element → Enter. With **fuzzy-fingers** enabled (pointer mode only), ~1 in 5 clicks intentionally miss first, then correct. See [Keyboard Navigation Mode](/reference/cli#keyboard-navigation-mode) and [Fuzzy-Finger Touch Simulation](/reference/cli#fuzzy-finger-touch-simulation).

```typescript [scene()]
user.click('submit-button')
user.click('user-card action-menu')   // nested selector

// Bare click -- clicks the current scope element
user.see('notification-item').click()
```
```typescript [test()]
await user.click('submit-button')
await user.click('user-card action-menu')   // nested selector

// Bare click -- clicks the current scope element
await user.see('notification-item').click()
```

### typeInto

```typescript
user.typeInto(selector: Selector, value: string): ConcurrentActorHandle | ActionChain
```

Clears and types text into the input matching the selector within the current scope.

In **keyboard mode**, this tabs to the input, selects all (Ctrl+A), deletes, then types character by character. With **fuzzy-fingers** enabled, the initial focus click may miss first.

```typescript [scene()]
user.typeInto('email-input', 'alice@example.com')
user.typeInto('search-form query', 'scenetest')   // nested selector
```
```typescript [test()]
await user.typeInto('email-input', 'alice@example.com')
await user.typeInto('search-form query', 'scenetest')
```

### check

```typescript
user.check(selector: Selector): ConcurrentActorHandle | ActionChain
```

Checks a checkbox matching the selector within the current scope.

In **keyboard mode**, this tabs to the checkbox and presses Space. With **fuzzy-fingers** enabled, the initial focus click may miss first.

```typescript [scene()]
user.check('terms-checkbox')
user.check('settings-form notifications-toggle')
```
```typescript [test()]
await user.check('terms-checkbox')
await user.check('settings-form notifications-toggle')
```

### select

```typescript
user.select(selector: Selector, value: string): ConcurrentActorHandle | ActionChain
```

Selects an option by value in a dropdown matching the selector within the current scope.

In **keyboard mode**, this tabs to the select element, then uses the browser's native `selectOption()` API.

```typescript [scene()]
user.select('country-dropdown', 'us')
user.select('settings timezone-select', 'America/New_York')
```
```typescript [test()]
await user.select('country-dropdown', 'us')
await user.select('settings timezone-select', 'America/New_York')
```


### pressKey

```typescript
user.pressKey(key: string): ConcurrentActorHandle | ActionChain
```

Sends a raw keyboard event via `page.keyboard.press()`. Accepts any [Playwright key name](https://playwright.dev/docs/api/class-keyboard) (`Escape`, `Enter`, `Tab`, `ArrowDown`, etc.). Use this when you need to send a key press that isn't tied to a specific element interaction.

```typescript [scene()]
user.see('intro-dialog')
user.pressKey('Escape')
user.see('main-page')
```
```typescript [test()]
await user.see('intro-dialog')
await user.pressKey('Escape')
await user.see('main-page')
```

```scenetest [markdown]
user:
- see intro-dialog
- pressKey Escape
- see main-page
```

## Timing & Coordination

### wait

```typescript
user.wait(ms: number): ConcurrentActorHandle | ActionChain
```

Pauses for the given number of milliseconds. Use sparingly -- prefer `see` or `seeText` to wait for specific conditions.

```typescript [scene()]
user.click('trigger-animation')
user.wait(500)
user.see('animation-result')
```
```typescript [test()]
await user.click('trigger-animation').wait(500)
await user.see('animation-result')
```

### emit

```typescript
user.emit(message: string): ConcurrentActorHandle | ActionChain
```

Emits a named message to the [message bus](#waitfor) for coordinating between actors. Messages are **sticky** -- if emitted before another actor calls `waitFor`, the `waitFor` resolves immediately.

```typescript [scene()]
user.click('send-friend-request')
user.emit('friend-request-sent')
```
```typescript [test()]
await user.click('send-friend-request').emit('friend-request-sent')
```

### waitFor

```typescript
user.waitFor(message: string): ConcurrentActorHandle | ActionChain
```

Blocks the actor's queue until the named message arrives on the message bus. Available in both scene() and test().

```typescript [scene()]
receiver.waitFor('data-ready')
receiver.openTo('/inbox')
receiver.seeText('New message')
```
```typescript [test()]
await receiver.waitFor('data-ready')
await receiver.openTo('/inbox')
await receiver.seeText('New message')
```

### do

```typescript
user.do(fn: (page: Page) => Promise<void>): ConcurrentActorHandle | ActionChain
```

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

### dsl

```typescript
user.dsl(text: string): ConcurrentActorHandle | ActionChain
```

Queues actions from a multiline text DSL string. Returns the actor (scene()) or an `ActionChain` (test()), so it chains with other methods.

```typescript [scene()]
user.dsl(`
  see login-form
  typeInto email alice@test.com
  click submit
`).see('dashboard')
```
```typescript [test()]
await user.dsl(`
  see login-form
  typeInto email alice@test.com
  typeInto password secret
  click submit
`)
```


## Scope Navigation

Actions like `see` set a **scope** -- a DOM element that subsequent actions search within. Scope navigation lets you move around the DOM tree during a chain.

### up

```typescript
user.up(selector?: Selector): ConcurrentActorHandle | ActionChain
```

Navigates from the current scope **up** to an ancestor matching the selector. When called with **no selector** (bare `up`), resets scope to the page root. Useful with [aliases](/reference/selectors) for finding named containers.

```typescript [scene()]
user
  .see('submit-button')
  .up('~form-container')         // go up to an ancestor matching alias
  .see('error-message')          // look for error-message within that ancestor

// Bare up -- reset to page root
user.up()
user.see('other-section')       // search from page root
```
```typescript [test()]
await user
  .see('submit-button')
  .up('~form-container')         // go up to an ancestor matching alias
  .see('error-message')

// Bare up -- reset to page root
await user.up()
await user.see('other-section')
```

### prev

```typescript
user.prev(): ConcurrentActorHandle | ActionChain
```

Returns to the **previous scope** before the last `see` or `up` changed it.

```typescript [scene()]
user
  .see('first-section')          // scope: first-section
  .see('nested-item')            // scope: nested-item inside first-section
  .prev()                        // scope: first-section again
  .click('other-button')         // clicks within first-section
```
```typescript [test()]
await user
  .see('first-section')          // scope: first-section
  .see('nested-item')            // scope: nested-item inside first-section
  .prev()                        // scope: first-section again
  .click('other-button')         // clicks within first-section
```

## Conditionals

### if

```typescript
user.if(selector: Selector, callback: (actor) => void | Promise<void>): void
```

Registers a **conditional watcher**. If the selector becomes visible during subsequent actions, the callback executes inline before continuing.

In scene(), the callback receives the actor and captures DSL calls as sub-actions (one-shot monitor). In test(), the callback is an async function that runs when triggered, and watchers are cleared after each `await`.

```typescript [scene()]
user.if('welcome-modal', (user) => {
  user.click('dismiss-welcome')
})
user.openTo('/dashboard')    // if welcome-modal appears, dismisses it
```
```typescript [test()]
user.if('welcome-modal', async () => {
  await user.click('dismiss-welcome')
})
await user.openTo('/dashboard')
```

This is not an assertion -- it handles optional UI that may or may not appear (onboarding modals, cookie banners, feature announcements).

### warnIf

```typescript
user.warnIf(selector: Selector, message: string): void
```

Registers a **script warning**. If the selector becomes visible during any subsequent action, a warning is recorded but the scene continues. Unlike `if`, these persist for the entire scene.

```typescript [scene()]
user.warnIf('welcome-modal', 'user has dismiss flag -- should not see welcome')
user.openTo('/dashboard')
user.see('main-content')
```
```typescript [test()]
user.warnIf('welcome-modal', 'user has dismiss flag -- should not see welcome')
await user.openTo('/dashboard')
await user.see('main-content')
```

Warnings appear in the scene report and indicate unexpected paths that aren't failures.

## Multi-Actor Coordination

Actors coordinate via `emit()` and `waitFor()` on the sticky message bus. Both methods are available in both scene() and test().

```typescript [scene()]
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
```ts [test()]
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

## Navigation Modes

Each actor is assigned a **navigation mode** — either `pointer` (default mouse/touch) or `keyboard` (Tab + Enter/Space). The mode is assigned automatically by the `NavigationModeRotation` and is transparent to spec authors: the same `click()`, `typeInto()`, `check()`, and `select()` calls work in both modes.

This is ON by default. To disable keyboard actor rotation, pass `--no-keyboard-actor` or set `noKeyboardActor: true` in config. See [Keyboard Navigation Mode](/reference/cli#keyboard-navigation-mode) for details.

### Fuzzy-Finger Touch Simulation

When `fuzzyFingers: true` is set in config (or `--fuzzy-fingers` is passed), pointer-mode actors simulate imprecise human touch. ~1 in 5 interactions intentionally miss the target, pause 100ms, then click correctly. If the mis-click causes the target to vanish (neighbor activated), a `FuzzyFingerError` is thrown.

See [Fuzzy-Finger Touch Simulation](/reference/cli#fuzzy-finger-touch-simulation) for details on strategies and error handling.

## Selectors

For selector syntax, see the [Selectors reference](/reference/selectors).

## Action Chains vs Concurrent Actors

In `test()` (Playwright specs), every actor method returns an `ActionChain`. Chains are **thenable** (`PromiseLike<void>`), so they execute when awaited. You can chain multiple actions that run sequentially:

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

In `scene()` (TypeScript scenes), every method returns the actor itself (`ConcurrentActorHandle`). Actions are queued synchronously and drained concurrently with other actors after the declaration phase completes.

For details on action chains vs concurrent actors, see the [TypeScript Authoring Modes reference](/reference/concurrent-and-classic).
