<div align="center">

# Scenetest

</div>

_Evaluate your product, not your tests. Write friendly little Scenes for your Actors. A Javascript testing framework inspired by Playwright's `page.evaluate` and Tanstack Server Functions._

---

## Installation

```bash
# For React apps
pnpm add @scenetest/react @scenetest/vite-plugin @scenetest/cli

# For Vue apps
pnpm add @scenetest/vue @scenetest/vite-plugin @scenetest/cli

# For Solid apps
pnpm add @scenetest/solid @scenetest/vite-plugin @scenetest/cli

# For Svelte apps
pnpm add @scenetest/svelte @scenetest/vite-plugin @scenetest/cli

# Core only (framework-agnostic)
pnpm add @scenetest/core @scenetest/vite-plugin @scenetest/cli
```

## Quick Start

### 1. Add the Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [react(), scenetest()],
})
```

The plugin automatically strips all scenetest code from production builds.

In development mode, a floating panel appears in your app showing assertions in real-time.

### 2. Write Inline Assertions in Your Components

```tsx
// src/components/ProfileForm.tsx
import { useState } from 'react'
import { should, failed } from '@scenetest/react'

export function ProfileForm({ user }) {
  const [name, setName] = useState(user.name)

  // These assertions run every render in dev/test mode
  should('user should be available', user !== undefined)

  // Use failed() as an escape hatch for unexpected states
  if (user?.error) {
    failed('user in unexpected error state', { error: user.error })
  }

  return (
    <form>
      <input value={name} onChange={e => setName(e.target.value)} />
    </form>
  )
}
```

### 3. Create a Scenetest Config

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',

  // Define test users/actors
  casts: [
    { user: { id: 'user-1', username: 'alice' } },
    { user: { id: 'user-2', username: 'bob' } },
  ],

  headed: true,        // Show browser window
  timeout: 30000,      // Scene timeout
  actionTimeout: 5000, // Per-action timeout
})
```

### 4. Write Scene Specs

```typescript
// scenes/profile.spec.ts
import { scene } from '@scenetest/cli'

scene('user can see the welcome page', async ({ cast }) => {
  const user = await cast('user')

  // Navigate to the app
  await user.goto('/')

  // Should see the main UI elements
  await user.seeId('profile-form')
  await user.seeId('name-input')
})

scene('user can update their name', async ({ cast }) => {
  const user = await cast('user')

  await user.goto('/')

  // Type a new name and submit
  await user
    .seeId('name-input')
    .typeInto('name-input', 'New Name')
    .clickId('submit-button')

  // Should see the updated display
  await user.seeText('New Name')
})
```

### 5. Add npm Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "scenetest"
  }
}
```

### 6. Run Tests

```bash
# Run all scenes
pnpm test

# Example output:
# Running 2 scenes...
#
# ✓ user can see the welcome page (1.2s)
#   Collected 12 assertions (12 passed, 0 failed)
#
# ✓ user can update their name (2.1s)
#   Collected 18 assertions (18 passed, 0 failed)
#
# All scenes completed: 2 passed, 0 failed
```

---

## Framework Packages

| Package | Description |
|---------|-------------|
| `@scenetest/core` | Core `should()`, `failed()`, `assert()`, `match()` functions |
| `@scenetest/react` | React bindings with `useTestEffect` hook (re-exports core) |
| `@scenetest/vue` | Vue bindings with `watchTestEffect` composable (re-exports core) |
| `@scenetest/solid` | Solid bindings with `createTestEffect` primitive (re-exports core) |
| `@scenetest/svelte` | Svelte bindings with `testEffect` helper (re-exports core) |
| `@scenetest/vite-plugin` | Vite plugin for dev panel and production stripping |
| `@scenetest/cli` | CLI runner for scene specs |

Each framework package re-exports everything from `@scenetest/core`, so you only need to import from your framework's package:

```tsx
// React - use @scenetest/react
import { should, failed, assert, useTestEffect } from '@scenetest/react'

// Vue - use @scenetest/vue
import { should, failed, assert, watchTestEffect } from '@scenetest/vue'

// Solid - use @scenetest/solid
import { should, failed, assert, createTestEffect } from '@scenetest/solid'

// Svelte - use @scenetest/svelte
import { should, failed, assert, testEffect } from '@scenetest/svelte'
```

---

## Scene API

### `scene(name, fn)`

Define a scene spec:

```typescript
import { scene } from '@scenetest/cli'

scene('descriptive name of the user journey', async ({ cast }) => {
  const user = await cast('primary-user-1')
  const friend = await cast('friend-of-1')
  // ... interactions between actors
})
```

### Actor Methods

The `cast()` function returns an actor with these methods:

```typescript
const user = await cast('user')

// Navigation
await user.goto('/path')

// Finding elements
await user.seeId('element-id')       // Wait for element with data-testid
await user.seeText('text content')   // Wait for text to appear

// Interactions
await user.clickId('button-id')
await user.typeInto('input-id', 'text to type')

// Chaining
await user
  .seeId('form')
  .typeInto('email', 'test@example.com')
  .clickId('submit')
```

---

## Multi-Context Assertions

For assertions that need to compare browser data with server data:

```tsx
// src/components/ProfileForm.tsx
import { useTestEffect, assert, should } from '@scenetest/react'

export function ProfileForm({ userId }) {
  const { profile, isLoading } = useProfile(userId)

  // Runs when deps change, compares browser and server data
  useTestEffect(() => {
    if (isLoading || !profile) return

    assert(
      'Profile matches database',
      async (server, data) => {
        const dbProfile = await server.getUser(userId)
        should('DB should match local', dbProfile.name === data.localProfile.name)
      },
      () => ({ localProfile: profile })
    )
  }, [isLoading, profile?.id])

  return <form>{/* ... */}</form>
}
```

### Server Configuration

Configure server functions in your scenetest config:

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  casts: [{ user: { id: 'user-1' } }],

  serverFunctions: {
    validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    getUser: (id) => db.users.findById(id),
  },
})
```

---

## Dev Panel

When running your app in development mode (`pnpm run dev`), Scenetest injects a floating panel that shows inline assertions in real-time as you interact with your app.

**Features:**
- **Live assertion feed**: See `should()` and `failed()` results as they fire
- **Pass/fail counts**: Quick summary of assertion results
- **Collapsible**: Click the header to minimize
- **Fullscreen mode**: Click the fullscreen button to open assertions in a dedicated window with stack traces
- **Clear button**: Reset assertions to start fresh

This lets you validate assertions without running tests - just click around your app and watch the assertions fire.

**Configuration:**
```typescript
// vite.config.ts
import scenetest from '@scenetest/vite-plugin'

// Disable the dev panel
scenetest({ devPanel: false })

// Force-enable in test mode
scenetest({ devPanel: true })
```

---

## Security Considerations

Scenetest is **development-only tooling** designed to run in trusted environments. Understanding its security model helps you use it safely.

### Dev Mode Security Model

In development mode, Scenetest:

- **Executes assertion code with full privileges**: Code inside `assert()` server functions runs in the Vite dev server context with access to Node.js APIs, file system, and any configured server functions.
- **Injects a dev panel into your app**: The floating panel renders assertion data including descriptions, file paths, and context objects.
- **Exposes window globals**: Functions like `window.__scenetest_report` are available for the dev panel to communicate with.

**This is safe for normal development** because you're running your own trusted code. However:

- **Do not run untrusted code** through Scenetest assertions
- **Do not expose dev mode** to untrusted users or networks
- **Treat dev mode like any other local development server** - it's not hardened for hostile environments

### Production Safety

**Production builds are safe by design.** The Vite plugin completely strips all Scenetest code:

- All imports from `scenetest-*` packages are removed
- All `should()`, `failed()`, `assert()`, and hook calls are removed
- No dev panel is injected
- No window globals are exposed
- Zero runtime overhead - the code literally doesn't exist in the bundle

You can verify this by inspecting your production build output.

### Best Practices

1. **Keep Scenetest in devDependencies** - It should never be bundled for production
2. **Use environment checks** - The plugin automatically detects build mode
3. **Don't put secrets in assertions** - Even though they're stripped, avoid hardcoding sensitive data
4. **Review assertion code** - Treat it like any other code in your codebase

### Promise Serialization Safety

Recent major vulnerabilities in other frameworks' server actions were about serializing closures that capture sensitive data—function references themselves could leak information when sent over the wire.

Scenetest's architecture is fundamentally different:

| Other Server Actions | Scenetest |
|----------------------|-----------|
| Function references sent at runtime | Functions extracted at **build time** via AST |
| Closures can capture secrets | `serverFn` is bundled server-side, no closure leak |
| Promises in closures could leak | Only JSON data crosses the wire |

**How Scenetest avoids this class of vulnerability:**

1. **Build-time extraction**: The `serverFn` passed to `assert()` is extracted at build time by the Vite plugin and bundled into server-side code. It is never serialized or sent over the network.

2. **Data-only serialization**: Only the return value of `withData()` is serialized (via `JSON.stringify`), which means only plain data crosses the wire—no functions, no closures, no promises.

3. **No closure capture**: Since server functions are extracted at build time, they cannot accidentally capture variables from their surrounding scope at runtime.

**Note**: If `withData()` returns a Promise, it will serialize to `{}`—you'll get data loss, not a security hole. Always return plain data from `withData()`.

---

## API Reference

### `should(description, condition, context?)`

Records an assertion. Passes when `condition` is truthy, fails when falsy. Optional `context` object for debugging.

```tsx
should('user should be logged in', user !== null)
should('form should have valid email', isValidEmail(email), { email })
```

### `failed(description, context?)`

Unconditional failure marker for unexpected code paths.

```tsx
if (error) {
  failed('unexpected error during save', { error: error.message })
  return
}

mutation.mutate(data, {
  onError: (err) => failed('mutation failed', { error: err })
})
```

### `assert(title, serverFn, withData?)`

Multi-context assertion for comparing browser and server data. Use in callbacks, effects, or anywhere you need to verify data across contexts.

```tsx
// In a callback
onSuccess: (data) => {
  assert(
    'Data saved correctly',
    async (server, data) => {
      const dbRecord = await server.db.get(data.id)
      should('record should exist', dbRecord !== null)
    },
    () => ({ id: data.id })
  )
}
```

### `useTestEffect(fn, deps)` (React)

React hook that wraps test code in a `useEffect`. The entire effect is stripped in production builds.

```tsx
useTestEffect(() => {
  if (!profile) return

  assert(
    'Profile matches database',
    async (server, data) => {
      const dbProfile = await server.db.get(data.userId)
      should('DB should match local', dbProfile.name === data.local.name)
    },
    { userId, profile },
  )
}, [userId, profile?.id])
```

Similar helpers exist for other frameworks:
- Vue: `watchTestEffect(fn)` - wraps `watchEffect`
- Solid: `createTestEffect(fn, deps?)` - wraps `createEffect`
- Svelte: `testEffect(fn)` - use inside `$effect`

### `match(...pairs)`

Compare pairs of values for equality. Returns `true` if all pairs match.

```tsx
should(
  'primary fields should match',
  match(
    [localDeck.cards, dbDeck.cards],
    [localDeck.updated_at, dbDeck.updated_at]
  )
)
```

---

## License

MIT
