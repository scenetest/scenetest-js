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
import { should, failed } from '@scenetest/checks-react'

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
import { should, failed, serverCheck, useCheck } from '@scenetest/checks-react'

// Vue
import { should, failed, serverCheck, watchCheck } from '@scenetest/checks-vue'

// Solid
import { should, failed, serverCheck, createCheck } from '@scenetest/checks-solid'

// Svelte (use inside $effect)
import { should, failed, serverCheck, checkEffect } from '@scenetest/checks-svelte'

// Framework-agnostic (just assertions)
import { should, failed, serverCheck } from '@scenetest/checks'
```

## Using `should()`

Use `should()` when checking that something **is true**:

```typescript
should(description, condition, context?)
```

- `description`: What you're asserting (string)
- `condition`: A boolean expression, **or a function returning a boolean** (see [Lazy conditions](#lazy-conditions-with-a-callback))
- `context`: Optional object with debugging info, **or a function returning one** (evaluated lazily)

```typescript
import { should } from '@scenetest/checks-react'

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

### Lazy Conditions with a Callback

`condition` can be a **function** that returns a boolean. Scenetest calls it and
evaluates the return value. This lets you keep a computation *inside* the
assertion instead of hoisting it into a variable:

```typescript
// Avoid: the work is hoisted into a variable, so it runs in production even
// after the Vite plugin strips the should() call
const results = expensiveSearch(query)
should('search returns results', results.length > 0)

// Prefer: the whole computation lives in the callback, so it only runs when the
// assertion runs — and strips from production along with the call
should('search returns results', () => expensiveSearch(query).length > 0)
```

The predicate receives the resolved `context`, so you can reuse it:

```typescript
should('all items are priced', (ctx) => ctx.items.every((i) => i.price > 0), { items })
```

If the predicate **throws**, Scenetest reports a failed assertion (with the error
message in context) rather than letting the exception escape into your render.

The `context` argument can likewise be a function — `should('...', cond, () => buildContext())` —
so expensive debugging context is only built when the assertion actually runs.

## Using `failed()`

Use `failed()` when something **should not happen**:

```typescript
failed(description, context?)
```

- `description`: What went wrong (string)
- `context`: Optional object with debugging info, **or a function returning one** (evaluated lazily, only when `failed()` runs)

```typescript
import { failed } from '@scenetest/checks-react'

function ErrorBoundary({ error }) {
  if (error) {
    failed('unexpected error in render', { error: error.message })
  }

  // ...
}
```

`failed()` is for paths that should never execute. If it runs, something is wrong.

> **Tip**: The `context` parameter is optional but highly valuable. Include relevant state that helps debug failures.

## Multi-Context Assertions with `serverCheck()`

For comparing browser data with server data, use `serverCheck()` with your framework's test effect hook:

```tsx
import { should, serverCheck, useCheck } from '@scenetest/checks-react'

function ProfileForm({ userId }) {
  const { profile, isLoading } = useProfile(userId)

  // Run assertions when profile changes
  useCheck(() => {
    if (isLoading || !profile) return

    serverCheck(
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

The `serverCheck()` function:
1. Captures data from the browser context
2. Runs a callback in the test runner context with access to server functions
3. Allows you to use `should()` inside to make assertions

### Configuring Server Functions

Define server functions in your scenetest config:

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',

  server: {
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

### Fold Guards Into the Check — Don't Wrap It in `if`

In production builds the Vite plugin strips scenetest imports and calls. A `should()`
call is removed cleanly, but a **bare `if` around it is not** — the guard condition
stays in your production bundle as dead code.

```tsx
// Avoid: the `if (items.length > 0)` guard still ships to production
if (items.length > 0)
  should('first item has a price', items[0].price > 0)
```

After stripping, production contains `if (items.length > 0) ;` — the assertion is
gone, but the guard (and the cost of evaluating it) remains.

Instead, fold the guard into the check's condition so the **whole expression**
disappears in production:

```tsx
// Prefer: the entire call, guard included, is stripped from production
should('first item has a price',
  items.length === 0 || items[0].price > 0)
```

Or use the **callback condition** when the check involves real work — the guard
and the computation both live in the function body and strip together:

```tsx
// Prefer: nothing here survives stripping
should('first item has a price', () => items.length === 0 || items[0].price > 0)
```

For reactive checks that take a callback (`useCheck`, `watchCheck`, `createCheck`,
`checkEffect`), put the guard **inside the callback body**, not around the call:

```tsx
// Avoid: the `if` survives stripping (and conditionally calling a hook
// also breaks the Rules of Hooks)
if (profile)
  useCheck(() => { should('name is set', !!profile.name) }, [profile])

// Prefer: the guard lives inside the callback, so it strips with the check
useCheck(() => {
  if (!profile) return
  should('name is set', !!profile.name)
}, [profile])
```

This keeps assertion logic — and its runtime cost — entirely out of production.

## Summary

- `should(description, condition, context?)` - assert something is true; `condition` may be a boolean or a `() => boolean` predicate (lazy)
- `failed(description, context?)` - mark code paths that should never run; `context` may be an object or a `() => object` (lazy)
- `serverCheck()` with test effects - compare browser and server data
- Assertions are grouped by timing (50ms threshold)
- Include context to make debugging easier
- Use your framework's check hook for reactive assertions
- Fold guards into the check so the whole call strips from production
