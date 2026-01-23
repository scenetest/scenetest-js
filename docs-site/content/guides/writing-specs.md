# Writing Effective Tests with Scenetest

This guide walks through best practices for writing end-to-end tests using Scenetest's inline assertions.

## The Philosophy: Write the Test First

With Scenetest, the test writer should describe **what they expect to happen** without worrying about implementation details. Write your assertions in plain language:

```typescript
// Don't worry about test IDs yet - describe the behavior
should('user sees the welcome message')
should('the continue button is visible')
should('clicking continue takes them to the dashboard')
```

Then, engineers can add the necessary hooks (test IDs, data attributes) to make the tests pass.

> **Best Practice**: Use test IDs like `data-testid="welcome-message"` rather than relying on CSS classes, text content, or DOM structure. Test IDs are stable, explicit, and communicate intent.

## Using `should()` and `failed()`

Scenetest provides two main assertion functions:

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

## Adding Test IDs

Test IDs create stable hooks for assertions. Add them to key elements:

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

## Writing Pseudo-Assertions First

A powerful workflow is to write "pseudo-assertions" that describe behavior without implementation:

```typescript
// Step 1: Write what you expect (even if it won't pass yet)
should('user sees the welcome box')
should('continue button is inside the welcome box')
should('clicking continue shows the next step')
```

Then generate a report for engineers:

---

### Example Report to Engineers

After writing your pseudo-tests, generate a report like this for the engineering team:

**Test: User Onboarding Flow**

To make these tests pass, please add the following:

1. Add `data-testid="welcome-box"` to the main welcome container
2. Add `data-testid="continue-button"` to the Continue button
3. Add `data-testid="onboarding-step"` with a `data-step` attribute to each step

Once these are added, the assertions will pass automatically.

---

## Grouping Related Assertions

Assertions that run at the same time (within 50ms) are automatically grouped in the observer panel. You can use this intentionally:

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

## Working with Async State

For async operations, place assertions where the data is used:

```typescript
function UserDashboard() {
  const [user, setUser] = createSignal(null)
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    const data = await fetchUser()
    setUser(data)
    setLoading(false)

    // Assert after data loads
    should('user data loaded', !!data, { userId: data?.id })
  })

  // Don't assert on loading state - that's expected
  if (loading()) return <Spinner />

  return <Profile user={user()} />
}
```

> **Warning**: Avoid asserting on intermediate loading states unless specifically testing loading behavior.

## The Collaboration Loop

Scenetest creates a natural collaboration between test writers and engineers:

1. **Test Writer**: Describes expected behavior with pseudo-assertions
2. **Test Writer**: Generates a report of needed test IDs
3. **Engineer**: Adds test IDs to components
4. **Tests**: Start passing automatically
5. **Both**: Iterate on edge cases

If a test ID can't be added easily, that might indicate a UX problem worth solving!

## Summary

- Write assertions that describe **behavior**, not implementation
- Use `should()` for positive checks, `failed()` for error cases
- Always include `context` for better debugging
- Use stable `data-testid` attributes
- Write pseudo-tests first, then report needed changes
- Let the observer panel guide your development
