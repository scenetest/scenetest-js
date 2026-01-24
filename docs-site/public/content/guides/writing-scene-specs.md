# Writing Scene Specs

Scene specs describe **user journeys**—the flows a person takes through your application. They live in separate spec files and orchestrate browser interactions without touching component internals.

## The Philosophy: Write the Test First

With Scenetest, the test writer describes **what they expect to happen** in plain language, without worrying about implementation details:

```typescript
// scenes/onboarding.spec.ts
import { scene } from '@scenetest/cli'

scene('user completes onboarding', async ({ cast }) => {
  const user = await cast('new-user')

  await user.goto('/')
  await user.seeId('welcome-box')
  await user.clickId('continue-button')
  await user.seeId('onboarding-step')
})
```

The test writer focuses on **what** should happen. Engineers then add the necessary hooks (test IDs, data attributes) to make the tests pass.

## Actor Methods

The `cast()` function returns an actor representing a user or role. Actors have these methods:

```typescript
const user = await cast('user')

// Navigation
await user.goto('/path')

// Finding elements
await user.seeId('element-id')       // Wait for data-testid
await user.seeText('text content')   // Wait for text

// Interactions
await user.clickId('button-id')
await user.typeInto('input-id', 'text to type')

// Chaining
await user
  .seeId('form')
  .typeInto('email', 'test@example.com')
  .clickId('submit')
```

## Writing Effective Scene Specs

### Describe the User's Intent

Write specs from the user's perspective. Each scene should tell a story:

```typescript
scene('user can complete checkout', async ({ cast }) => {
  const customer = await cast('customer')

  await customer.goto('/cart')
  await customer.seeId('cart-items')
  await customer.clickId('checkout-button')
  await customer.seeId('payment-form')
  await customer.typeInto('card-number', '4242424242424242')
  await customer.clickId('pay-button')
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
  casts: [
    { 'new-user': { id: 'user-1' } },
    { customer: { id: 'user-2', cart: ['item-1'] } },
  ],
})
```

## Summary

- Scene specs describe **user journeys** with `scene()` and `cast()`
- Write specs in **plain language** from the user's perspective
- Use stable `data-testid` attributes as the contract with engineers
- Generate **handoff reports** listing needed test IDs
- Let the collaboration loop guide development
