---
name: inline-assertions
description: >-
  Use when writing, reviewing, or generating Scenetest inline assertions —
  `should()`, `failed()`, and `serverCheck()` — inside application code
  (components, hooks, event handlers) for any framework (React, Vue, Solid,
  Svelte, or vanilla) via the @scenetest/checks family of packages. Covers the
  correct call signatures, the lazy callback form of `should()` that keeps
  expensive computation inline and strips from production, multi-context
  `serverCheck()`, context for debugging, and the production-stripping rules
  that determine where guards may live. Apply this whenever a task adds or edits
  `should(...)`, `failed(...)`, or `serverCheck(...)` calls.
---

# Writing Scenetest Inline Assertions

Inline assertions live **inside application code** and verify internal state
that external tests can't easily observe. They run during normal execution and
report to the Scenetest observer. In production, the Vite plugin **strips every
`@scenetest/*` import and call** via an AST transform — so assertions add zero
runtime cost to shipped code, *as long as you follow the stripping rules below*.

Import from the binding that matches the app's framework. All bindings
re-export the same `should` / `failed` / `serverCheck`:

```ts
import { should, failed, serverCheck } from '@scenetest/checks/react'  // or /vue, /solid, /svelte
import { should, failed, serverCheck } from '@scenetest/checks'        // framework-agnostic
```

## `should(description, condition, context?)`

Assert that something **is true**.

- `description` — a natural "should" sentence (string).
- `condition` — a **boolean OR a `() => boolean` predicate** (see below).
- `context?` — optional debugging object, **or a `() => object`** evaluated lazily.

```ts
should('user has a display name', !!user.displayName)
should('email is verified', user.emailVerified, { email: user.email })
```

### Prefer the lazy callback form for any non-trivial computation

`condition` accepts a function returning a boolean. **Use it whenever the check
involves real work.** This is the single most important pattern in this skill.

```ts
// ❌ AVOID — the computation is hoisted into a variable, so it runs in
//    PRODUCTION even though the should() call itself is stripped out.
const results = expensiveSearch(query)
should('search returns results', results.length > 0)

// ✅ PREFER — the whole computation lives in the callback. It only runs when
//    the assertion runs, and strips from production together with the call.
should('search returns results', () => expensiveSearch(query).length > 0)
```

Why this matters: stripping removes the `should(...)` call, but a variable
declared *before* it (`const results = expensiveSearch(query)`) is ordinary
application code and stays in the bundle, running on every render in production.
Folding the work into the predicate moves it inside the call that gets removed.

The predicate receives the resolved `context`, so you can reuse it:

```ts
should('all items are priced', (ctx) => ctx.items.every((i) => i.price > 0), { items })
```

A predicate that **throws** is reported as a *failed* assertion (with the error
message in context) — it never escapes into your render. Do **not** wrap
`should()` in `try/catch` to guard against this.

> Note: a function is always truthy. `should('x', () => cond)` is evaluated as a
> predicate (correct). Never write `should('x', someFunction)` expecting the
> function *reference* to be the condition — pass a call or an arrow.

## `failed(description, context?)`

Mark a code path that **should never execute**. It always reports a failure.

- `context?` — object, **or a `() => object`** evaluated lazily (only when
  `failed()` runs), so expensive context construction strips with the call.

```ts
switch (response.type) {
  case 'success': return processSuccess(response)
  case 'error':   return processError(response)
  default:        failed('unknown response type', { type: response.type })
}
```

Use `failed()` for impossible branches and unexpected error states — think of it
as a tracked `console.error` for "this should not happen".

## `serverCheck(title, serverFn, withData?)` — multi-context

Compare browser data against server/database data. Run it from your framework's
reactive check hook (`useCheck` / `watchCheck` / `createCheck` / `checkEffect`),
guarding inside the callback:

```tsx
import { should, serverCheck, useCheck } from '@scenetest/checks/react'

useCheck(() => {
  if (isLoading || !profile) return
  serverCheck(
    'Profile matches database',
    async (server, data) => {
      const dbUser = await server.getUser(data.userId)
      should('name should match', dbUser.name === data.localName)
    },
    () => ({ userId, localName: profile.name }),
  )
}, [isLoading, profile?.id])
```

- `serverFn(server, data)` runs in the test-runner context; `server` is the
  `server` object from `scenetest/config.ts`. Use `should()` inside it.
- `withData()` collects browser-side data to send to the server. Keep it
  serializable.

## Production stripping rules (critical)

The plugin strips `should()` / `failed()` / `serverCheck()` calls cleanly, but
**a bare `if` wrapped around a call is NOT stripped** — the guard condition
survives as dead code.

```tsx
// ❌ AVOID — after stripping, `if (items.length > 0) ;` remains in production
if (items.length > 0) should('first item priced', items[0].price > 0)
```

Fold the guard into the condition (or the predicate) so the **entire** call
disappears:

```tsx
// ✅ boolean form, guard folded in
should('first item priced', items.length === 0 || items[0].price > 0)

// ✅ callback form — guard AND computation both strip
should('first item priced', () => items.length === 0 || items[0].price > 0)
```

For reactive checks, put the guard **inside the callback body**, never around
the hook call (wrapping the hook also breaks the Rules of Hooks):

```tsx
// ✅
useCheck(() => {
  if (!profile) return
  should('name is set', !!profile.name)
}, [profile])
```

## Best practices

- **Assert invariants, not values.** `should('total matches sum', total === sum(items))`
  beats `should('total is set', total !== undefined)`.
- **Include context** that helps debug failures — it shows in the observer panel.
- **Reserve `failed()`** for paths that indicate a bug, not normal control flow.
- **Reach for the lazy form by default** for anything beyond a cheap comparison.

## Quick reference

| Call | Signature | Lazy forms |
| --- | --- | --- |
| `should` | `(description, condition, context?)` | `condition` may be `() => boolean`; `context` may be `() => object` |
| `failed` | `(description, context?)` | `context` may be `() => object` |
| `serverCheck` | `(title, serverFn, withData?)` | `serverFn`/`withData` are callbacks by design |
