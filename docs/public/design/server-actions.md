# Multi-Context Assertions Design Doc

**STATUS: Design Stage** - Detailed design, not yet implemented.

---

## Overview

This document describes the design for the `serverCheck()` API - inline assertions that compare data across browser and server contexts. The pattern is inspired by React Server Actions: code is written colocated and type-aware, but compiled to run on the server.

## Problem Statement

Current `should()` and `failed()` run entirely in the browser. They can access React state, cache, and localStorage, but cannot:

- Query a real database with privileged credentials
- Access server-side APIs or secrets
- Run Node.js-only code

We want developers to write assertions like this:

```typescript
const mutation = useUpdateProfile({
  onSuccess: (data) => {
    queryClient.setQueryData(['profile', userId], data)
    console.log('Yay we updated the profile! hope the tests pass')
	 serverCheck(
      'Profile update persisted',
      async (server, data) => {
        const dbRecord = await server.getProfile(data.userId)

        should('DB should be updated recently',
          Date.now() - new Date(dbRecord.updated_at).getTime() < 5000)

        should('DB should match form input',
          dbRecord.name === data.formInput.name)

        should('Cache should match DB',
          data.cacheValue.name === dbRecord.name)
      },
      {
        odlerId,
        formInput: data.input,
        mutationResult: data.result,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      },
    )
  },
})
```

The `withData` function runs in the browser (has access to React state, cache, etc.), while `serverFn` runs on the server (has access to database).

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         VITE DEV SERVER                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User's App                         Scenetest Middleware           │
│  ┌──────────────────┐               ┌──────────────────────────┐    │
│  │                  │               │                          │    │
│  │  mutation        │               │  POST /__scenetest/run  │    │
│  │    onSuccess:    │               │    ↓                     │    │
│  │   serverCheck() │ ────POST────► │  Load serverFn by ID     │    │
│  │        │         │               │    ↓                     │    │
│  │        ↓         │               │  Create server context   │    │
│  │  withData() runs  │               │  (from scenetest/config)│    │
│  │  serialize       │               │    ↓                     │    │
│  │  POST to server  │ ◄───JSON───── │  Run serverFn(server,    │    │
│  │        ↓         │               │              data)    │    │
│  │  Results to      │               │    ↓                     │    │
│  │  dev panel       │               │  Collect should/failed   │    │
│  │                  │               │  Return results          │    │
│  └──────────────────┘               └──────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** The Vite plugin handles everything. No additional server process. The middleware runs inside the existing Vite dev server.

## Build-Time Transform

The Vite plugin transforms `serverCheck()` calls at build time.

### Input (what the developer writes)

```typescript
// src/components/ProfileForm.tsx
import { serverCheck, should } from '@scenetest/checks'

const mutation = useUpdateProfile({
  onSuccess: (data) => {
    serverCheck(
      'Profile update persisted'
      async (server, data) => {
        const db = await server.getProfile(data.userId)
        should('DB should match input', db.name === data.newName)
        should('Cache should match DB', data.cacheValue.name === db.name)
      },
		{
        userId,
        newName: data.input.name,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      },
    )
  },
})
```

### Output (browser bundle)

```typescript
// src/components/ProfileForm.tsx (transformed)
import { __scenetest_rpc } from '@scenetest/checks/runtime'

const mutation = useUpdateProfile({
  onSuccess: (data) => {
    __scenetest_rpc({
      id: 'src/components/ProfileForm.tsx:12:4',
      title: 'Profile update persisted',
      withData: () => ({
        userId,
        newName: data.input.name,
        cacheValue: queryClient.getQueryData(['profile', userId]),
      }),
    })
  },
})
```

### Output (server module)

The plugin extracts all `serverFn` functions into a virtual module served by the middleware:

```typescript
// Virtual: /__scenetest/assertions.js
import { should, failed } from '@scenetest/checks'

export const assertions = {
  'src/components/ProfileForm.tsx:12:4': async (server, data) => {
    const db = await server.getProfile(data.userId)
    should('DB should match input', db.name === data.newName)
    should('Cache should match DB', data.cacheValue.name === db.name)
  },
  // ... other extracted serverFns
}
```

### Production Build

In production, the entire `serverCheck()` call is stripped (same as current `should()`/`failed()` behavior).

## Runtime Flow

### 1. Browser: Collect and Send

```typescript
// @scenetest/checks/runtime (browser)
export async function __scenetest_rpc(config: {
  id: string
  title: string
  withData: () => unknown
}) {
  // Collect data from app context
  let serializedData: string
  try {
    const data = config.withData()
    serializedData = JSON.stringify(data)
  } catch (error) {
    // Report collection failure
    window.__scenetest_report?.({
      type: 'fail',
      description: `[${config.title}] withData error: ${error.message}`,
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
        withData: serializedData,
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

### 2. Server: Execute serverFn

```typescript
// Vite plugin middleware
async function handleAssertionRun(req, res) {
  const { id, title, withData } = req.body

  // Load extracted assertions
  const { assertions } = await import('/__scenetest/assertions.js')
  const serverFn = assertions[id]

  if (!serverFn) {
    return res.json([{
      type: 'fail',
      description: `[${title}] Assertion not found: ${id}`,
      result: false,
      timestamp: Date.now(),
    }])
  }

  // Create server context from user config
  const serverContext = await loadServerContext()

  // Collect results from pass/fail calls inside serverFn
  const results = []
  const collector = (result) => results.push(result)

  try {
    // Run with result collection
    await runWithCollector(collector, async () => {
      await serverFn(serverContext, JSON.parse(withData))
    })
  } catch (error) {
    results.push({
      type: 'fail',
      description: `[${title}] serverFn threw: ${error.message}`,
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
// scenetest/config.ts
import { defineConfig } from '@scenetest/vite-plugin'
import { db } from './src/db'

export default defineConfig({
  server: {
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
2. Creates the `server` context object from `config.server`
3. Passes it to each `serverFn` when executed

## Type Safety

TypeScript should infer `data` type from `withData` return type:

```typescript
serverCheck({
  title: 'Type-safe assertion',

  // Return type is inferred: { userId: string, name: string }
  withData: () => ({
    userId: user.id,
    name: formData.name,
  }),

  // data is typed as { userId: string, name: string }
  serverFn: async (server, data) => {
    data.userId  // ✓ string
    data.name    // ✓ string
    data.foo     // ✗ Type error
  },
})
```

Type definition:

```typescript
interface ServerCheckConfig<TwithData> {
  title: string
  key?: string  // Optional: for uniqueness in loops/conditionals
  withData: () => TwithData
  serverFn: (server: ServerContext, data: TwithData) => Promise<void> | void
}

function serverCheck<TwithData>(config: ServerCheckConfig<TwithData>): void
```

For `ServerContext`, users can extend the type:

```typescript
// scenetest/config.ts
declare module '@scenetest/checks' {
  interface ServerContext {
    getProfile: (id: string) => Promise<Profile>
    getOrder: (id: string) => Promise<Order>
  }
}
```

## Results Flow

Results from `serverFn` flow through the existing infrastructure:

```text
serverFn runs on server
    ↓
should()/failed() collect results
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
- Multi-context assertions appear in the dev panel alongside simple `should()`/`failed()` calls
- Playwright collects them without any changes to the fixture
- Grouping by timing still works (assertions from same user action batch together)

## Dev Panel Integration

Multi-context assertions show additional info:

```text
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Profile update persisted                    [server]     │
├─────────────────────────────────────────────────────────────┤
│  ✓ DB matches input                                         │
│  ✓ Cache matches DB                                         │
│                                                             │
│  withData: { userId: "123", newName: "Alice", ... }         │
│  src/components/ProfileForm.tsx:12                          │
└─────────────────────────────────────────────────────────────┘
```

The `[server]` badge indicates this assertion ran on the server.

## Playwright Integration

No changes needed to the checks package Playwright fixture. It already collects results via `window.__scenetest_report`. Multi-context assertion results flow through the same channel.

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

1. Extend Vite plugin to detect `serverCheck()` calls
2. Extract `serverFn` to virtual module
3. Transform call site to `__scenetest_rpc`
4. Generate assertion IDs from file location

### Phase 2: Middleware

1. Add `/__scenetest/run` endpoint to Vite plugin
2. Load and execute extracted serverFns
3. Collect and return results
4. Load server context from config

### Phase 3: Browser Runtime

1. Implement `__scenetest_rpc` function
2. Handle serialization errors
3. Report results to `__scenetest_report`

### Phase 4: Configuration

1. Define `scenetest/config.ts` format
2. Load config in Vite plugin
3. Create server context from config
4. TypeScript types for server functions

### Phase 5: Integration

1. Update dev panel to show server assertions
2. Add `waitForAssertions` to Playwright fixture
3. Pending assertion tracking

## Design Decisions

### 1. No imports in serverFn

`serverFn` cannot import from the user's codebase. Everything it needs must come from:
- `server` - configured server functions (database, APIs, etc.)
- `data` - data collected by `withData()` in the browser

This keeps extraction simple and makes dependencies explicit.

### 2. Optional `key` for unique identification

For assertions in loops or conditionals, use an optional `key` to ensure unique IDs:

```typescript
items.forEach(item => {
  serverCheck({
    title: 'Item validation',  // Clean title for display
    key: item.id,              // Combined with file location for unique ID
    withData: () => ({ itemId: item.id, value: item.value }),
    serverFn: async (server, data) => {
      const db = await server.getItem(data.itemId)
      should('DB should match', db.value === data.value)
    },
  })
})
```

The internal ID becomes: `${fileLocation}:${key ?? ''}` (e.g., `src/List.tsx:42:4:item-123`)

### 3. Sync and async serverFn supported

```typescript
// Async (most common - database calls)
serverFn: async (server, data) => {
  const db = await server.getProfile(data.userId)
  should('names should match', db.name === data.name)
}

// Sync (simple checks)
serverFn: (server, data) => {
  should('format should be valid', data.email.includes('@'))
}
```

### 4. Catch withData errors

If `withData()` throws, catch and report as a failed assertion. Server checks should never crash the app.

## File Changes

```text
packages/
├── checks/
│   └── src/
│       ├── assertions.ts      # Add serverCheck() signature (stripped in prod)
│       ├── runtime.ts         # New: __scenetest_rpc for browser
│       └── types.ts           # Add ServerCheckConfig, ServerContext
│
├── vite/
│   └── src/
│       ├── index.ts           # Add middleware setup
│       ├── transform.ts       # Extend to handle serverCheck()
│       ├── extract.ts         # New: Extract serverFn to virtual module
│       ├── middleware.ts      # New: /__scenetest/run handler
│       └── config.ts          # New: Load scenetest/config.ts
│
└── checks/
    └── src/
        └── fixtures.ts        # Add waitForAssertions()
```
