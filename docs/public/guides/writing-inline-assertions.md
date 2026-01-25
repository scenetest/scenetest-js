# Writing Inline Assertions

Inline assertions live **inside your components** and verify internal state that external tests can't easily observe. They run during normal component execution and report to the Scenetest observer.

## When to Use Inline Assertions

Use inline assertions when you want to verify:

- State that's computed but not directly rendered
- Invariants that should always hold
- Error conditions that should never occur
- Data integrity between related state values

```tsx
// src/components/Cart.tsx
import { should, failed } from 'scenetest-react'

function Cart({ items }) {
  should('cart has items', items.length > 0)

  if (items.some(item => item.price < 0)) {
    failed('found item with negative price', { items })
  }

  return <div data-testid="cart-items">...</div>
}
```

## Framework Imports

Import from your framework's package:

```typescript
// React
import { should, failed, assert, useTestEffect } from 'scenetest-react'

// Vue
import { should, failed, assert, watchTestEffect } from 'scenetest-vue'

// Solid
import { should, failed, assert, createTestEffect } from 'scenetest-solid'

// Svelte (use inside $effect)
import { should, failed, assert, testEffect } from 'scenetest-svelte'

// Framework-agnostic (just assertions)
import { should, failed, assert } from 'scenetest'
```

## Using `should()`

Use `should()` when checking that something **is true**:

```typescript
should(description, condition, context?)
```

- `description`: What you're asserting (string)
- `condition`: Boolean expression to check
- `context`: Optional object with debugging info

```typescript
import { should } from 'scenetest-react'

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

## Using `failed()`

Use `failed()` when something **should not happen**:

```typescript
failed(description, context?)
```

- `description`: What went wrong (string)
- `context`: Optional object with debugging info

```typescript
import { failed } from 'scenetest-react'

function ErrorBoundary({ error }) {
  if (error) {
    failed('unexpected error in render', { error: error.message })
  }

  // ...
}
```

`failed()` is for paths that should never execute. If it runs, something is wrong.

> **Tip**: The `context` parameter is optional but highly valuable. Include relevant state that helps debug failures.

## Multi-Context Assertions with `assert()`

For comparing browser data with server data, use `assert()` with your framework's test effect hook:

```tsx
import { should, assert, useTestEffect } from 'scenetest-react'

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

The `assert()` function:
1. Captures data from the browser context
2. Runs a callback in the test runner context with access to server functions
3. Allows you to use `should()` inside to make assertions

### Configuring Server Functions

Define server functions in your scenetest config:

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  serverFunctions: {
    getUser: (id) => db.users.findById(id),
    validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  },
})
```

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

This helps you understand which assertions are related and ran together during a single render or state update.

## Best Practices

### Assert Invariants, Not Implementation

Good assertions verify **what must be true**, not how it's computed:

```typescript
// Good: asserts an invariant
should('total matches sum of items',
  order.total === order.items.reduce((sum, i) => sum + i.price, 0))

// Less useful: just checks a value exists
should('total is set', order.total !== undefined)
```

### Include Helpful Context

Context appears in the observer panel and helps debug failures:

```typescript
should('user can access feature', user.hasPermission('feature'), {
  userId: user.id,
  role: user.role,
  permissions: user.permissions,
})
```

### Use `failed()` for Error Paths

Reserve `failed()` for code paths that indicate bugs:

```typescript
function handleResponse(response) {
  switch (response.type) {
    case 'success':
      return processSuccess(response)
    case 'error':
      return processError(response)
    default:
      failed('unknown response type', { type: response.type })
  }
}
```

## Summary

- `should(description, condition, context?)` - assert something is true
- `failed(description, context?)` - mark code paths that should never run
- `assert()` with test effects - compare browser and server data
- Assertions are grouped by timing (50ms threshold)
- Include context to make debugging easier
- Use your framework's test effect hook for reactive assertions
