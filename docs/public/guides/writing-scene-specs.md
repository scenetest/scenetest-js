# Writing Scene Specs

Scene specs describe **user journeys**—the flows a person takes through your application. They live in separate spec files and orchestrate browser interactions without touching component internals.

## The Philosophy: Write the Test First

With Scenetest, the test writer describes **what they expect to happen** in plain language, without worrying about implementation details:

```typescript
// scenes/onboarding.spec.ts
import { scene } from '@scenetest/cli'

scene('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')

  await user.openTo('/')
  await user.see('welcome-box')
  await user.click('continue-button')
  await user.see('onboarding-step')
})
```

The test writer focuses on **what** should happen. Engineers then add the necessary hooks (test IDs, data attributes) to make the tests pass.

## Actor Methods

The `actor()` function returns an actor handle representing a user or role. Here are the most common methods:

```typescript
const user = await actor('user')

// Navigation
await user.openTo('/path')            // Full page load

// Visibility
await user.see('element-id')          // Wait for element visible (updates scope)
await user.see('modal form')          // Nested selector: form inside modal
await user.notSee('loading-spinner')  // Wait for element hidden
await user.seeText('text content')    // Wait for text visible
await user.seeToast('success-toast')  // Wait for appear AND disappear

// Interactions
await user.click('button-id')
await user.typeInto('input-id', 'text to type')
await user.check('agree-checkbox')
await user.select('country-dropdown', 'Canada')

// Scope navigation
await user.see('modal').see('form').prev()  // Back to modal scope
await user.see('child').up('~container')    // Up to ancestor

// Utilities
await user.wait(500)
await user.scrollToBottom()
await user.emit('user-ready')              // Message bus for actor coordination
await user.do(async (page) => { /* ... */ })  // Custom Playwright action

// Chaining
await user
  .see('form')
  .typeInto('email', 'test@example.com')
  .click('submit')
```

Actors also support [form helpers](/reference/actor-api#check) (`check`, `select`), [control flow](/reference/actor-api#wait)
(`wait`, `emit`, `do`), [scope navigation](/reference/actor-api#up) (`up`, `prev`), and [conditionals](/reference/actor-api#if)
(`if`, `warnIf`). See the [Actor API Reference](/reference/actor-api) for the complete method list.


## Nested Selectors

All selector methods support space-separated test IDs for targeting nested elements:

```typescript
// Click button inside a specific card
await user.click('user-card action-button')

// Type into input inside a modal form
await user.typeInto('settings-modal email-input', 'new@email.com')

// Wait for element inside nested containers
await user.see('sidebar nav-menu settings-link')
```

## Toast/Notification Testing

Use `seeToast()` to wait for transient UI elements that appear and then disappear:

```typescript
await user.click('save-button')
await user.seeToast('success-notification')  // Waits for appear AND disappear
```

## Scope Navigation

`see()` updates the actor's **current scope** -- subsequent actions search within the matched element. Use `prev()` and `up()` to navigate scope without drilling deeper:

```typescript
await user
  .see('settings-modal')       // scope → modal
  .see('profile-form')         // scope → form inside modal
  .typeInto('name', 'Alice')   // types within form
  .prev()                      // scope → back to modal
  .click('close-button')       // clicks modal's close button
```

`up(selector)` navigates to an ancestor matching the selector. Works well with aliases:

```typescript
await user
  .see('nested-item')
  .up('~container')           // navigate up to a named container
  .click('action-button')
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

```typescript
scene('user can complete checkout', async ({ actor }) => {
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

> **Best Practice**: Name test IDs based on **what they represent**, not how they look. Use `data-testid="submit-order"` not `data-testid="blue-button"`.

## The Handoff: Reporting to Engineers

After writing scene specs, generate a report for the engineering team. This is the key collaboration point:

**Test: User Onboarding Flow**

To make these tests pass, please add the following:

1. Add `data-testid="welcome-box"` to the main welcome container
2. Add `data-testid="continue-button"` to the Continue button
3. Add `data-testid="onboarding-step"` with a `data-step` attribute to each step

Once these are added, the scene will pass automatically.

---

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

Configure your scenes in `scenetest.config.ts`:

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
})
```

Actor teams are defined in separate files. See [Building Good Teams of Actors](./building-teams.md) for details.

## Summary

- Scene specs describe **user journeys** with `scene()` and `actor()`
- Write specs in **plain language** from the user's perspective
- Use stable `data-testid` attributes as the contract with engineers
- Use **nested selectors** (`'parent child'`) to target specific elements
- Use **scope navigation** (`prev()`, `up()`) to move between scoped contexts
- Use `seeToast()` for transient notifications
- Use `if()` for conditional handling and `warnIf()` for flagging unexpected paths
- Generate **handoff reports** listing needed test IDs
- Let the collaboration loop guide development

For the complete list of actor methods, selectors, and action chain details, see the [Actor API Reference](/reference/actor-api).
