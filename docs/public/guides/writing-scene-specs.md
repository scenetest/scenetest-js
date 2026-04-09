# Writing Scene Specs

> **Note:** This guide shows all three authoring styles side by side. For the full execution model comparison and "do not mix" rules, see the [Concurrent and Classic Mode reference](/reference/concurrent-and-classic). For the `.spec.md` format, see the [Text DSL reference](/reference/text-dsl).

Scene specs describe **user journeys** — the flows a person takes through your application. They live in separate spec files (`.spec.ts` or `.spec.md`) and orchestrate browser interactions without touching component internals.

## The Markdown DSL

The primary and most-advised way to write scenes is with the Markdown DSL, which is basically Javascript without the punctuation. The following Markdown and Typescript produce the same scene output:

```scenetest [markdown]
// scenes/user-onboarding.spec.md
# user completes onboarding

new-user:
- openTo /
- see welcome-box
- click continue-button

best-friend:
- openTo /friends/search
- typeInto search-input [new-user.username]
- see results-box [new-user.key]



```
```ts [javascript]
// scenes/user-onboarding.spec.ts
import { scene } from '@scenetest/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  const friend = actor('best-friend')

  user.openTo('/')
      .see('welcome-box')
      .click('continue-button')
  friend.openTo('/friends/search')
      .typeInto('search-input', user.username)
      .see(`results-box ${user.key}`)
})
```

We recommend you start off just writing in markdown specs, and see how far you get with it. We think you'll love it (and it will look _so_ nice in your GitHub repo). But you always have the typescript approach available to you, if you need it.

## A Secret Third Thing (Classic Mode)

There is a secret third way to author specs, using the same classic `await actor.action()` driver model that you
might be used to from Playwright/Cypress world. In single-actor scenes, there is functionally no difference between
classic mode and the native "concurrent" mode, but if for some reason you
really want to write async/await style specs, see the docs on [Concurrent Flow & Classic Driver](/faq/concurrent-vs-classic).

- **Markdown DSL** — human-readable `.spec.md` files that compile to concurrent actor scripts.
- **Concurrent Flow (TS)** — full TypeScript control over your scene spec. Actions queue up per actor and drain concurrently. No promises, no race conditions flaking your tests.
- **Classic Driver (TS)** — the async/await model you know from Cypress/Playwright, with access to the Scenetest message bus and our document selectors.

Click the tabs to compare:


```scenetest [concurrent md]
# user completes onboarding

new-user:
- openTo /
- see welcome-box
- click continue-button

best-friend:
- openTo /friends/search
- typeInto search-input [new-user.username]
- see results-box [new-user.key]



```

```ts [concurrent ts]
import { scene } from '@scenetest/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  const friend = actor('best-friend')

  user.openTo('/')
      .see('welcome-box')
      .click('continue-button')
  friend.openTo('/friends/search')
      .typeInto('search-input', user.username)
      .see(`results-box ${user.key}`)
})
```

```ts [classic driver ts]
import { test } from '@scenetest/scenes'

test('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')
  const friend = await actor('best-friend')

  await user.openTo('/')
  await user.see('welcome-box')
            .click('continue-button')
  await friend.openTo('/friends/search')
  await friend.typeInto('search-input', user.username)
  await friend.see(`results-box ${user.key}`)
})
```

**Concurrent** is the native model — actor creation is synchronous, actions queue up, and all actors drain concurrently when the function returns. **Text DSL** is the most minimal format — plain `.spec.md` files that are human-readable, GitHub-renderable, and executable. They compile to concurrent scripts. **Classic Driver** is the async/await model for those coming from Playwright or Cypress — you `await` each action and control the timeline yourself.

The test writer focuses on **what** should happen. Engineers then add the necessary hooks (test IDs, data attributes) to make the tests pass.

## Actor Methods

The `actor()` function returns an actor handle representing a user or role. Actors can navigate pages, assert visibility, interact with elements (click, type, check, select), navigate scope, coordinate with other actors via the message bus, and run custom Playwright actions. They also support conditionals, warnings, and inline text DSL via `dsl()`.

For the complete method list including all navigation, visibility, interaction, scope, and control flow methods, see the [Actor API Reference](/reference/actor-api).

## Selectors

All selector methods support space-separated test IDs for targeting nested elements, ancestor navigation with `up()`, and alias resolution. For the full selector syntax and resolution rules, see the [Selectors Reference](/reference/selectors).

## Toast/Notification Testing

Use `seeToast()` to wait for transient UI elements that appear and then disappear:

```typescript
user.click('save-button')
user.seeToast('success-notification')  // Waits for appear AND disappear
```

## Scope Navigation

`see()` updates the actor's **current scope** -- subsequent actions search within the matched element. Use `prev()` and `up()` to navigate scope without drilling deeper:

```typescript
await user
  .see('settings-modal')       // scope -> modal
  .see('profile-form')         // scope -> form inside modal
  .typeInto('input', 'Alice')  // types within form
  .prev()                      // scope -> back to modal
  .click('close-button')       // clicks modal's close button
```

`up(selector)` navigates to an ancestor matching the selector. Works well with aliases. `up()` with no selector resets scope to the page root:

```typescript
await user
  .see('nested-item')
  .up('~container')           // navigate up to a named container
  .click('action-button')

// Reset to page root
await user.up()               // scope -> page (clears all scope)
await user.see('other-section')
```

## Conditional Handling

Use `if()` to handle optional UI (modals, banners, announcements) that may or may not appear, and `warnIf()` to flag unexpected paths without failing the test. See the [Conditional Handling guide](/guides/conditional-handling) for a full walkthrough of when and how to use each.

## Writing Effective Scene Specs

### Describe the User's Intent

Write specs from the user's perspective. Each scene should tell a story:

```ts [concurrent.spec.ts]
scene('user can complete checkout', ({ actor }) => {
  const customer = actor('customer')

  customer.openTo('/cart')
     .see('cart-items')
     .click('checkout-button')
  customer.see('payment-form')
     .typeInto('card-number', '4242424242424242')
     .click('pay-button')
  customer.seeText('Order confirmed!')
})
```

```scenetest [text-dsl.spec.md]
# user can complete checkout
customer:
- openTo /cart
- see cart-items
- click checkout-button
- see payment-form
- typeInto card-number 4242424242424242
- click pay-button
- seeText Order confirmed!
```


```ts [classic.spec.ts]
test('user can complete checkout', async ({ actor }) => {
  const customer = await actor('customer')

  await customer.openTo('/cart')
  await customer.see('cart-items')
  await customer.click('checkout-button')
  await customer.see('payment-form')
  await customer.typeInto('card-number', '4242424242424242')
  await customer.click('pay-button')
  await customer.seeText('Order confirmed!')
})
```

### Choosing the Right Attribute

Scenetest's [selector resolution](/reference/selectors) matches each token against six attributes. In practice, you'll use three:

| Attribute | Use for | Example |
|-----------|---------|---------|
| `data-testid` | One-of-a-kind elements and list containers | `data-testid="checkout-form"` |
| `aria-label` | Interactive elements (buttons, links, inputs) | `aria-label="close-dialog"` |
| `data-key` | Items inside a list container | `data-key="fr"` |

For **static elements** that appear once on a page, `data-testid` is the default. Name by **what it represents**, not how it looks:

```tsx
// Good
<button data-testid="submit-order">Place Order</button>
<div data-testid="cart-summary">...</div>

// Bad
<button data-testid="blue-button">Place Order</button>
<div data-testid="top-div">...</div>
```

For **interactive elements** (buttons, links, inputs), prefer `aria-label`. It does double duty -- accessible to screen readers *and* targetable by specs:

```tsx
<button aria-label="remove-item" onClick={handleRemove}>
  <TrashIcon />
</button>
```

The `@scenetest/eslint-plugin` includes a `prefer-aria-label` rule that flags interactive elements with `data-testid` but no `aria-label`. Enable it:

```js
// eslint.config.js
import scenetest from '@scenetest/eslint-plugin'

export default [
  scenetest.configs.recommended,
  // ... your other config
]
```

For **list items**, use the container + `data-key` pattern described in the [Selectors Reference](/reference/selectors#container--data-key-pattern).

| Situation | Attribute | Spec selector |
|-----------|-----------|--------------|
| A form that appears once | `data-testid="login-form"` | `login-form` |
| A submit button | `aria-label="submit-login"` | `submit-login` |
| An icon-only button | `aria-label="close-dialog"` | `close-dialog` |
| A list container | `data-testid="user-list"` | `user-list` |
| A row inside that list | `data-key={user.id}` | `user-list abc123` |
| A button inside a list row | `aria-label="edit-user"` (on the button) | `user-list abc123 edit-user` |
| A static section | `data-testid="sidebar"` | `sidebar` |
| Items with no container | `data-name="tab" data-key="settings"` | `tab settings` |

### Common Mistakes

**Embedding state in `data-testid`:**

```tsx
// Don't
<div data-testid={`order-${order.status}`}>  // "order-pending", "order-shipped"

// Do
<div data-testid="order-card" data-status={order.status}>
```

Specs should target `order-card`, not guess at status suffixes.

**Using index as key:**

```tsx
// Don't
<li data-key={index}>

// Do
<li data-key={item.id}>
```

Array indices shift when items are added or removed. Use stable identifiers.

**Bare `data-key` without a labeled container:**

```tsx
// Don't — data-key alone has no context
<div>
  <li data-key={todo.id}>...</li>
</div>

// Do — label the container
<div data-testid="todo-list">
  <li data-key={todo.id}>...</li>
</div>
```

Without a named container, the spec has to target `data-key` directly, which is fragile if multiple lists on the page share key values. The container gives the scope.

### Adding Markers to an Existing Codebase

If you're adding markers to an existing codebase in bulk, see the LLM prompt in the [Getting Started guide](/guides/getting-started#4-add-semantic-dom-markers). It walks through finding selector tokens in your specs and adding the right attributes to your components.

The short version:
1. Read your spec files to find every selector token
2. Find the corresponding element in your source
3. Add `data-testid` for static elements and list containers, `aria-label` for interactive elements, `data-key` for items inside a container
4. Run `pnpm scenetest` and watch specs start passing

## The Handoff: Reporting to Engineers

After writing scene specs, generate a report for the engineering team. This is the key collaboration point:

**Test: User Onboarding Flow**

To make these tests pass, please add the following:

1. Add `data-testid="welcome-box"` to the main welcome container
2. Add `data-testid="continue-button"` to the Continue button
3. Add `data-testid="onboarding-steps"` to the step container, and `data-key` to each step

Once these are added, the scene should start to pass.

If a test ID can't be added easily, that might indicate a UX problem worth solving!

## The Collaboration Loop

Scenetest creates a natural workflow between test writers and engineers:

1. **Test Writer**: Writes scene specs describing user journeys in plain language
2. **Test Writer**: Generates a report listing needed test IDs
3. **Engineer**: Adds test IDs to components
4. **Engineer**: Optionally adds inline assertions for internal state verification
5. **Tests**: Pass automatically when IDs are in place
6. **Both**: Iterate on edge cases and new flows

This separation means:
- Test writers don't need to know React/Vue/Solid internals
- Engineers don't need to understand test orchestration
- The test IDs become a contract between the two roles

## Configuration

For configuration, see the [guides overview](/guides).

## Cleanup and Setup Directives

Markdown scenes can declare `cleanup:` and `setup:` expressions for managing database state around a scene. These run server-side before and after scene steps.

**Execution order:** `cleanup (before)` → `setup` → scene steps → `cleanup (after)`.

```scenetest
## review mode shows 2-buttons

cleanup: supabase.from('user_deck').update({ review_answer_mode: null }).eq('uid', '[learner.key]')
setup: supabase.from('user_deck').update({ review_answer_mode: '2-buttons' }).eq('uid', '[learner.key]')

learner:
- openTo /review
- see 2-buttons-mode
```

Multiple `cleanup:` and `setup:` lines are supported — all execute in order. Use `[team.field]` to interpolate team metadata (from `tags` in `defineTeam()`), and `[testStart]` to scope cleanup to rows created during the test.

For the full syntax, see the [Text DSL reference](/reference/text-dsl#cleanup-and-setup-directives).

## Summary

- Scene specs describe **user journeys** — write them as concurrent TypeScript, text DSL markdown, or classic driver-style TypeScript
- Write specs in **plain language** from the user's perspective
- Choose your format: concurrent `scene()` for simplicity, `.spec.md` for maximum readability, classic `test()` for async/await compatibility
- Use stable `data-testid` attributes on containers, `data-key` on list items, and `aria-label` on interactive elements as the contract with engineers
- Use **scope navigation** (`prev()`, `up()`, bare `up`) to move between scoped contexts
- Use `seeInView()` to check viewport visibility without scrolling
- Use bare `click` to click the current scope element
- Use `seeToast()` for transient notifications
- Use `pressKey()` to send raw keyboard events (`Escape`, `Enter`, `Tab`, etc.)
- Use `cleanup:` and `setup:` directives in markdown specs for database state management
- Use `if()` for conditional handling and `warnIf()` for flagging unexpected paths
- Generate **handoff reports** listing needed test IDs
- Let the collaboration loop guide development

For the complete list of actor methods, see the [Actor API Reference](/reference/actor-api). For selector syntax, see the [Selectors Reference](/reference/selectors). For configuration options, see the [guides overview](/guides).
