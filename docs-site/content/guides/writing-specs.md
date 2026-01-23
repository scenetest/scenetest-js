# Writing Effective Tests with Scenetest

This guide walks through best practices for writing end-to-end tests using Scenetest's inline assertions and scene specs.

## The Philosophy: Write the Test First

With Scenetest, the test writer should describe **what they expect to happen** without worrying about implementation details. Write your scene specs in plain language:

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

Then, engineers can add the necessary hooks (test IDs, data attributes) to make the tests pass.

> **Best Practice**: Use test IDs like `data-testid="welcome-message"` rather than relying on CSS classes, text content, or DOM structure. Test IDs are stable, explicit, and communicate intent.

## Two Types of Tests

Scenetest separates testing into two concerns:

### 1. Scene Specs (User Journeys)

Scene specs live in separate files and orchestrate browser interactions:

```typescript
// scenes/checkout.spec.ts
import { scene } from '@scenetest/cli'

scene('user can complete checkout', async ({ cast }) => {
  const user = await cast('customer')

  await user.goto('/cart')
  await user.seeId('cart-items')
  await user.clickId('checkout-button')
  await user.seeId('payment-form')
  await user.typeInto('card-number', '4242424242424242')
  await user.clickId('pay-button')
  await user.seeText('Order confirmed!')
})
```

### 2. Inline Assertions (Component State)

Inline assertions live in your components and verify internal state:

```tsx
// src/components/Cart.tsx
import { should, failed } from '@scenetest/react'

function Cart({ items }) {
  should('cart has items', items.length > 0)

  if (items.some(item => item.price < 0)) {
    failed('found item with negative price', { items })
  }

  return <div data-testid="cart-items">...</div>
}
```

## Using `should()` and `failed()`

### `should(description, condition, context?)`

Use `should()` when checking that something **is true**:

```typescript
import { should } from '@scenetest/react'

function UserProfile({ user }) {
  should('user has a display name', !!user.displayName)
  should('user email is verified', user.emailVerified, { email: user.email })

  return (
    <div data-testid="user-profile">
      <h1>{user.displayName}</h1>
    </div>
  )
}
```

### `failed(description, context?)`

Use `failed()` when something **should not happen**:

```typescript
import { failed } from '@scenetest/react'

function ErrorBoundary({ error }) {
  if (error) {
    failed('unexpected error in render', { error: error.message })
  }

  // ...
}
```

> **Tip**: The `context` parameter is optional but highly valuable. Include relevant state that helps debug failures.

## Multi-Context Assertions

For comparing browser data with server data, use `assert()` with `useTestEffect()`:

```tsx
import { should, assert, useTestEffect } from '@scenetest/react'

function ProfileForm({ userId }) {
  const { profile, isLoading } = useProfile(userId)

  // Run assertions when profile changes
  useTestEffect(() => {
    if (isLoading || !profile) return

    assert(
      'Profile matches database',
      async (server, data) => {
        const dbProfile = await server.getUser(data.userId)
        should('name should match', dbProfile.name === data.localName)
      },
      () => ({ userId, localName: profile.name })
    )
  }, [isLoading, profile?.id])

  return <form>...</form>
}
```

Configure server functions in your scenetest config:

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  casts: [{ user: { id: 'user-1' } }],

  serverFunctions: {
    getUser: (id) => db.users.findById(id),
    validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  },
})
```

## Adding Test IDs

Test IDs create stable hooks for both scene specs and assertions:

```tsx
// Good: explicit test IDs
<button data-testid="submit-order">Place Order</button>
<div data-testid="cart-summary">...</div>
<span data-testid="total-price">{formattedPrice}</span>

// Avoid: relying on text content or classes
<button class="btn-primary">Place Order</button>  // class could change
<button>Place Order</button>  // text could be translated
```

> **Best Practice**: Name test IDs based on **what they represent**, not how they look. Use `data-testid="submit-order"` not `data-testid="blue-button"`.

## Writing Scene Specs

### Actor Methods

The `cast()` function returns an actor with these methods:

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

### Example Report to Engineers

After writing your scene specs, generate a report for the engineering team:

**Test: User Onboarding Flow**

To make these tests pass, please add the following:

1. Add `data-testid="welcome-box"` to the main welcome container
2. Add `data-testid="continue-button"` to the Continue button
3. Add `data-testid="onboarding-step"` with a `data-step` attribute to each step

Once these are added, the scene will pass automatically.

---

## Grouping Related Assertions

Assertions that run at the same time (within 50ms) are automatically grouped in the observer panel:

```typescript
function OrderSummary({ order }) {
  // These will appear as a group in the observer
  should('order has items', order.items.length > 0)
  should('order has a total', order.total > 0)
  should('order has shipping address', !!order.shippingAddress)

  return (
    <div data-testid="order-summary">
      {/* ... */}
    </div>
  )
}
```

## The Collaboration Loop

Scenetest creates a natural collaboration between test writers and engineers:

1. **Test Writer**: Writes scene specs describing user journeys
2. **Test Writer**: Generates a report of needed test IDs
3. **Engineer**: Adds test IDs to components
4. **Engineer**: Adds inline assertions for internal state
5. **Tests**: Pass automatically
6. **Both**: Iterate on edge cases

If a test ID can't be added easily, that might indicate a UX problem worth solving!

## Summary

- **Scene specs** describe user journeys with `scene()` and `cast()`
- **Inline assertions** verify component state with `should()` and `failed()`
- **Multi-context assertions** compare browser and server data with `assert()`
- Use stable `data-testid` attributes
- Write tests first, then report needed changes to engineers
- Let the observer panel guide your development
