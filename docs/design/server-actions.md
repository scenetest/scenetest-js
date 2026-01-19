# Multi-Context Assertions Design Doc

## Overview

This document describes the design for the `assertion()` API - inline assertions that compare data across browser and server contexts. The pattern is inspired by React Server Actions: code is written colocated and type-aware, but compiled to run on the server.

## Problem Statement

Current `pass()` and `fail()` run entirely in the browser. They can access React state, cache, and localStorage, but cannot:

- Query a real database with privileged credentials
- Access server-side APIs or secrets
- Run Node.js-only code

We want developers to write assertions like this:

```typescript
const mutation = useUpdateProfile({
  onSuccess: (data) => {
    assertion({
      title: 'Profile update persisted',
      appData: () => ({
        odlerId,
        formInput: data.input,
        mutationResult: data.result,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      }),
      assertFn: async (server, fromApp) => {
        const dbRecord = await server.getProfile(fromApp.userId)

        pass('DB updated recently',
          Date.now() - new Date(dbRecord.updated_at).getTime() < 5000)

        pass('DB matches form input',
          dbRecord.name === fromApp.formInput.name)

        pass('Cache matches DB',
          fromApp.cacheValue.name === dbRecord.name)
      },
    })
  },
})
```

The `appData` function runs in the browser (has access to React state, cache, etc.), while `assertFn` runs on the server (has access to database).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VITE DEV SERVER                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User's App                         Scenetest Middleware            │
│  ┌──────────────────┐               ┌──────────────────────────┐    │
│  │                  │               │                          │    │
│  │  mutation        │               │  POST /__scenetest/run   │    │
│  │    onSuccess:    │               │    ↓                     │    │
│  │      assertion() │ ────POST────► │  Load assertFn by ID     │    │
│  │        │         │               │    ↓                     │    │
│  │        ↓         │               │  Create server context   │    │
│  │  appData() runs  │               │  (from scenetest.config) │    │
│  │  serialize       │               │    ↓                     │    │
│  │  POST to server  │ ◄───JSON───── │  Run assertFn(server,    │    │
│  │        ↓         │               │              fromApp)    │    │
│  │  Results to      │               │    ↓                     │    │
│  │  dev panel       │               │  Collect pass/fail       │    │
│  │                  │               │  Return results          │    │
│  └──────────────────┘               └──────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** The Vite plugin handles everything. No additional server process. The middleware runs inside the existing Vite dev server.

## Build-Time Transform

The Vite plugin transforms `assertion()` calls at build time.

### Input (what the developer writes)

```typescript
// src/components/ProfileForm.tsx
import { assertion, pass } from 'scenetest'

const mutation = useUpdateProfile({
  onSuccess: (data) => {
    assertion({
      title: 'Profile update persisted',
      appData: () => ({
        userId,
        newName: data.input.name,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      }),
      assertFn: async (server, fromApp) => {
        const db = await server.getProfile(fromApp.userId)
        pass('DB matches input', db.name === fromApp.newName)
        pass('Cache matches DB', fromApp.cacheValue.name === db.name)
      },
    })
  },
})
```

### Output (browser bundle)

```typescript
// src/components/ProfileForm.tsx (transformed)
import { __scenetest_rpc } from 'scenetest/runtime'

const mutation = useUpdateProfile({
  onSuccess: (data) => {
    __scenetest_rpc({
      id: 'src/components/ProfileForm.tsx:12:4',
      title: 'Profile update persisted',
      appData: () => ({
        userId,
        newName: data.input.name,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      }),
    })
  },
})
```

### Output (server module)

The plugin extracts all `assertFn` functions into a virtual module served by the middleware:

```typescript
// Virtual: /__scenetest/assertions.js
import { pass, fail } from 'scenetest'

export const assertions = {
  'src/components/ProfileForm.tsx:12:4': async (server, fromApp) => {
    const db = await server.getProfile(fromApp.userId)
    pass('DB matches input', db.name === fromApp.newName)
    pass('Cache matches DB', fromApp.cacheValue.name === db.name)
  },
  // ... other extracted assertFns
}
```

### Production Build

In production, the entire `assertion()` call is stripped (same as current `pass()`/`fail()` behavior).

## Runtime Flow

### 1. Browser: Collect and Send

```typescript
// scenetest/runtime (browser)
export async function __scenetest_rpc(config: {
  id: string
  title: string
  appData: () => unknown
}) {
  // Collect data from app context
  let serializedData: string
  try {
    const data = config.appData()
    serializedData = JSON.stringify(data)
  } catch (error) {
    // Report collection failure
    window.__scenetest_report?.({
      type: 'fail',
      description: `[${config.title}] appData error: ${error.message}`,
      result: false,
      timestamp: Date.now(),
    })
    return
  }

  // Send to server
  try {
    const response = await fetch('/__scenetest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: config.id,
        title: config.title,
        appData: serializedData,
      }),
    })

    const results = await response.json()

    // Report each result to dev panel / Playwright
    for (const result of results) {
      window.__scenetest_report?.(result)
    }
  } catch (error) {
    window.__scenetest_report?.({
      type: 'fail',
      description: `[${config.title}] Server error: ${error.message}`,
      result: false,
      timestamp: Date.now(),
    })
  }
}
```

### 2. Server: Execute assertFn

```typescript
// Vite plugin middleware
async function handleAssertionRun(req, res) {
  const { id, title, appData } = req.body

  // Load extracted assertions
  const { assertions } = await import('/__scenetest/assertions.js')
  const assertFn = assertions[id]

  if (!assertFn) {
    return res.json([{
      type: 'fail',
      description: `[${title}] Assertion not found: ${id}`,
      result: false,
      timestamp: Date.now(),
    }])
  }

  // Create server context from user config
  const serverContext = await loadServerContext()

  // Collect results from pass/fail calls inside assertFn
  const results = []
  const collector = (result) => results.push(result)

  try {
    // Run with result collection
    await runWithCollector(collector, async () => {
      await assertFn(serverContext, JSON.parse(appData))
    })
  } catch (error) {
    results.push({
      type: 'fail',
      description: `[${title}] assertFn threw: ${error.message}`,
      result: false,
      timestamp: Date.now(),
      stack: error.stack,
    })
  }

  return res.json(results)
}
```

## Configuration

Users configure server functions in a config file:

```typescript
// scenetest.config.ts
import { defineScenetestConfig } from 'vite-plugin-scenetest'
import { db } from './src/db'

export default defineScenetestConfig({
  serverFunctions: {
    // These become available as server.getProfile(), etc.
    getProfile: async (userId: string) => {
      return db.query('SELECT * FROM profiles WHERE id = $1', [userId])
    },

    getOrder: async (orderId: string) => {
      return db.query('SELECT * FROM orders WHERE id = $1', [orderId])
    },

    // Can use any async operation: HTTP, file system, etc.
    fetchExternalAPI: async (endpoint: string) => {
      const res = await fetch(`https://api.example.com/${endpoint}`)
      return res.json()
    },
  },
})
```

The Vite plugin:
1. Loads this config at dev server startup
2. Creates the `server` context object from `serverFunctions`
3. Passes it to each `assertFn` when executed

## Type Safety

TypeScript should infer `fromApp` type from `appData` return type:

```typescript
assertion({
  title: 'Type-safe assertion',

  // Return type is inferred: { userId: string, name: string }
  appData: () => ({
    userId: user.id,
    name: formData.name,
  }),

  // fromApp is typed as { userId: string, name: string }
  assertFn: async (server, fromApp) => {
    fromApp.userId  // ✓ string
    fromApp.name    // ✓ string
    fromApp.foo     // ✗ Type error
  },
})
```

Type definition:

```typescript
interface AssertionConfig<TAppData> {
  title: string
  key?: string  // Optional: for uniqueness in loops/conditionals
  appData: () => TAppData
  assertFn: (server: ServerContext, fromApp: TAppData) => Promise<void> | void
}

function assertion<TAppData>(config: AssertionConfig<TAppData>): void
```

For `ServerContext`, users can extend the type:

```typescript
// scenetest.config.ts
declare module 'scenetest' {
  interface ServerContext {
    getProfile: (id: string) => Promise<Profile>
    getOrder: (id: string) => Promise<Order>
  }
}
```

## Results Flow

Results from `assertFn` flow through the existing infrastructure:

```
assertFn runs on server
    ↓
pass()/fail() collect results
    ↓
Results returned as JSON
    ↓
Browser receives results
    ↓
window.__scenetest_report(result)
    ↓
┌─────────────────────────────────────┐
│                                     │
│   Dev Panel (if present)            │
│   - Shows in UI                     │
│   - Groups with other assertions    │
│                                     │
│   Playwright (if in test mode)      │
│   - Collects in scenePage.assertions│
│                                     │
└─────────────────────────────────────┘
```

This means:
- Multi-context assertions appear in the dev panel alongside simple `pass()`/`fail()` calls
- Playwright collects them without any changes to the fixture
- Grouping by timing still works (assertions from same user action batch together)

## Dev Panel Integration

Multi-context assertions show additional info:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Profile update persisted                    [server]     │
├─────────────────────────────────────────────────────────────┤
│  ✓ DB matches input                                         │
│  ✓ Cache matches DB                                         │
│                                                             │
│  appData: { userId: "123", newName: "Alice", ... }         │
│  src/components/ProfileForm.tsx:12                          │
└─────────────────────────────────────────────────────────────┘
```

The `[server]` badge indicates this assertion ran on the server.

## Playwright Integration

No changes needed to the Playwright fixture. It already collects results via `window.__scenetest_report`. Multi-context assertion results flow through the same channel.

For coordinating timing (waiting for assertions to complete):

```typescript
test('Profile update', async ({ scenePage }) => {
  await scenePage.goto('/profile')
  await scenePage.getByLabel('Name').fill('New Name')
  await scenePage.getByRole('button', { name: 'Save' }).click()

  // Wait for server assertions to complete
  await scenePage.waitForAssertions({ timeout: 5000 })

  expect(scenePage.failed).toHaveLength(0)
})
```

Implementation of `waitForAssertions`:

```typescript
// Track pending assertions
let pending = 0

// In browser runtime
async function __scenetest_rpc(...) {
  pending++
  try {
    // ... fetch and report
  } finally {
    pending--
  }
}

// Expose to Playwright
window.__scenetest_pending = () => pending

// In fixture
async waitForAssertions(options = {}) {
  const timeout = options.timeout ?? 5000
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const pending = await this.page.evaluate(() =>
      window.__scenetest_pending?.() ?? 0
    )
    if (pending === 0) return
    await new Promise(r => setTimeout(r, 50))
  }

  throw new Error('Timed out waiting for assertions')
}
```

## Implementation Plan

### Phase 1: Core Transform

1. Extend Vite plugin to detect `assertion()` calls
2. Extract `assertFn` to virtual module
3. Transform call site to `__scenetest_rpc`
4. Generate assertion IDs from file location

### Phase 2: Middleware

1. Add `/__scenetest/run` endpoint to Vite plugin
2. Load and execute extracted assertFns
3. Collect and return results
4. Load server context from config

### Phase 3: Browser Runtime

1. Implement `__scenetest_rpc` function
2. Handle serialization errors
3. Report results to `__scenetest_report`

### Phase 4: Configuration

1. Define `scenetest.config.ts` format
2. Load config in Vite plugin
3. Create server context from config
4. TypeScript types for server functions

### Phase 5: Integration

1. Update dev panel to show server assertions
2. Add `waitForAssertions` to Playwright fixture
3. Pending assertion tracking

## Design Decisions

### 1. No imports in assertFn

`assertFn` cannot import from the user's codebase. Everything it needs must come from:
- `server` - configured server functions (database, APIs, etc.)
- `fromApp` - data collected by `appData()` in the browser

This keeps extraction simple and makes dependencies explicit.

### 2. Optional `key` for unique identification

For assertions in loops or conditionals, use an optional `key` to ensure unique IDs:

```typescript
items.forEach(item => {
  assertion({
    title: 'Item validation',  // Clean title for display
    key: item.id,              // Combined with file location for unique ID
    appData: () => ({ itemId: item.id, value: item.value }),
    assertFn: async (server, fromApp) => {
      const db = await server.getItem(fromApp.itemId)
      pass('DB matches', db.value === fromApp.value)
    },
  })
})
```

The internal ID becomes: `${fileLocation}:${key ?? ''}` (e.g., `src/List.tsx:42:4:item-123`)

### 3. Sync and async assertFn supported

```typescript
// Async (most common - database calls)
assertFn: async (server, fromApp) => {
  const db = await server.getProfile(fromApp.userId)
  pass('matches', db.name === fromApp.name)
}

// Sync (simple checks)
assertFn: (server, fromApp) => {
  pass('valid format', fromApp.email.includes('@'))
}
```

### 4. Catch appData errors

If `appData()` throws, catch and report as a failed assertion. Assertions should never crash the app.

## File Changes

```
packages/
├── scenetest/
│   └── src/
│       ├── assertions.ts      # Add assertion() signature (stripped in prod)
│       ├── runtime.ts         # New: __scenetest_rpc for browser
│       └── types.ts           # Add AssertionConfig, ServerContext
│
├── vite-plugin-scenetest/
│   └── src/
│       ├── index.ts           # Add middleware setup
│       ├── transform.ts       # Extend to handle assertion()
│       ├── extract.ts         # New: Extract assertFn to virtual module
│       ├── middleware.ts      # New: /__scenetest/run handler
│       └── config.ts          # New: Load scenetest.config.ts
│
└── playwright-scenetest/
    └── src/
        └── fixtures.ts        # Add waitForAssertions()
```
