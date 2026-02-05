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
- see results-box [new-user.id]



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
      .see(`results-box ${user.id}`)
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
- see results-box [new-user.id]



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
      .see(`results-box ${user.id}`)
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
  await friend.see(`results-box ${user.id}`)
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

Use `if()` to register a watcher for elements that may or may not appear. If the selector becomes visible during the next `await`, the callback runs:

```typescript
// Handle a welcome modal that sometimes appears
user.if('welcome-modal', () => user.click('dismiss'))
await user.see('dashboard')  // If modal appears, it gets dismissed first
```

Watchers are cleared after each `await`, so they only apply to the immediately following action.

## Script Warnings

Use `warnIf()` to flag unexpected paths without failing the test. Unlike `if()`, warnings persist for the entire scene:

```typescript
user.warnIf('welcome-modal', 'user should have dismiss flag set')
await user.openTo('/dashboard')
await user.see('main-content')
```

Warnings are reported separately in `SceneReport.warnings` and are useful for tracking deprecation paths, flaky conditions, and A/B test monitoring.

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

### Use Meaningful Test IDs

Test IDs create stable hooks between specs and components:

```tsx
// Good: explicit test IDs based on what they represent
<button data-testid="submit-order">Place Order</button>
<div data-testid="cart-summary">...</div>
<span data-testid="total-price">{formattedPrice}</span>

// Avoid: relying on text content or classes
<button class="btn-primary">Place Order</button>  // class could change
<button>Place Order</button>  // text could be translated
```

> **Best Practice**: Name test IDs based on **what they represent**, not how they look. Use `data-testid="submit-order"` not `data-testid="blue-button"`. For list items, prefer `data-name` + `data-key` over dynamic `data-testid`. See the full [Preparing Your DOM](/guides/preparing-your-dom) guide.

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

## Summary

- Scene specs describe **user journeys** — write them as concurrent TypeScript, text DSL markdown, or classic driver-style TypeScript
- Write specs in **plain language** from the user's perspective
- Choose your format: concurrent `scene()` for simplicity, `.spec.md` for maximum readability, classic `test()` for async/await compatibility
- Use stable `data-testid` attributes on containers, `data-key` on list items, and `aria-label` on interactive elements as the contract with engineers
- Use **scope navigation** (`prev()`, `up()`, bare `up`) to move between scoped contexts
- Use `seeInView()` to check viewport visibility without scrolling
- Use bare `click` to click the current scope element
- Use `seeToast()` for transient notifications
- Use `if()` for conditional handling and `warnIf()` for flagging unexpected paths
- Generate **handoff reports** listing needed test IDs
- Let the collaboration loop guide development

For the complete list of actor methods, see the [Actor API Reference](/reference/actor-api). For selector syntax, see the [Selectors Reference](/reference/selectors). For configuration options, see the [guides overview](/guides).
