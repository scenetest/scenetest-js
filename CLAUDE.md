# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Scenetest is a **working implementation** with a complete CLI runner, inline assertion system, actor-based scene DSL, Vite plugin, dev panel (observer), and Playwright integration. The `assert()` multi-context feature (server-side assertions) is stubbed but not yet wired end-to-end; everything else is functional.

Design docs live in `docs/public/design/`. The README.md has the public-facing overview.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Start example app dev server
pnpm dev:rebuild      # Rebuild plugin then start dev server
pnpm typecheck        # Type check all packages
pnpm -r test          # Run all unit tests (351 tests across 3 packages)
```

## Package Structure

```
packages/
├── scenetest/              # Core library - should(), failed(), assert(), match()
├── scenetest-react/        # React bindings - useTestEffect hook (re-exports core)
├── scenetest-vue/          # Vue bindings - watchTestEffect composable (re-exports core)
├── scenetest-solid/        # Solid bindings - createTestEffect primitive (re-exports core)
├── scenetest-svelte/       # Svelte bindings - testEffect helper (re-exports core)
├── scenetest-cli/          # CLI runner - scene(), actor(), DSL, selectors, teams, config
├── vite-plugin/            # Vite plugin - dev panel injection, prod stripping, RPC middleware
├── observer/               # Dev panel UI - floating panel, fullscreen, history, audio
├── playwright-scenetest/   # Playwright fixtures (scenePage, assertions)
├── example-app-react/      # React demo app with working Scene tests
├── example-app-vue/        # Vue demo app
├── example-app-solid/      # Solid demo app
└── example-app-svelte/     # Svelte 5 demo app
```

---

## How to Plan a Testing Strategy with Scenetest

Scenetest separates two concerns that traditional E2E frameworks conflate:

1. **Scenes** — Orchestration scripts that simulate user journeys (login, fill form, click submit). Written in spec files. The person writing scenes doesn't need to know implementation details.
2. **Inline Assertions** — `should()` and `failed()` calls placed directly in application code (components, hooks, callbacks). They run every time that code executes, whether triggered by a scene, the dev panel, or a human clicking around.

### The key insight

Scenes test **user journeys**. Inline assertions test **the developer's mental model** of how the system works. These are different things and benefit from being authored by different people in different places.

### What to put where

| Concern | Where it goes | Who writes it | Example |
|---------|--------------|---------------|---------|
| "User can log in and update their profile" | Scene spec file (`scenes/*.spec.ts`) | QA, PM, or developer | `await user.openTo('/login')` ... `await user.click('submit')` |
| "Profile data should be loaded before render" | Inline assertion in component | Component author | `should('profile loaded', profile !== undefined)` |
| "Form should not submit with empty name" | Inline assertion in submit handler | Feature developer | `failed('empty name submitted', { name })` |
| "After mutation, cache matches server" | Multi-context assertion (future) | Feature developer | `assert({ title: '...', serverFn, withData })` |

### Writing scenes

```typescript
// scenes/profile.spec.ts
import { scene } from '@scenetest/cli'

scene('user updates their profile', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/login')
  await user
    .see('login-form')
    .typeInto('email', user.email)
    .typeInto('password', user.password)
    .click('submit')

  await user.see('dashboard')
  await user.openTo('/profile')
  await user
    .see('profile-form')
    .typeInto('name-input', 'New Name')
    .click('save-button')

  await user.seeText('New Name')
})
```

### Writing inline assertions

```tsx
// components/ProfileForm.tsx
import { should, failed } from '@scenetest/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

### Multi-actor scenes

```typescript
scene('two users can chat', async ({ actor }) => {
  const alice = await actor('alice')
  const bob = await actor('bob')

  await alice.openTo('/chat')
  await bob.openTo('/chat')

  await alice
    .see('message-input')
    .typeInto('message-input', 'Hello Bob!')
    .click('send-button')

  await bob.seeText('Hello Bob!')
})
```

### Configuration

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  browser: 'chromium',
  headed: false,
  timeout: 30000,
  actionTimeout: 5000,
  warnAfter: 500,
  aliases: {
    modal: '[role=dialog]',
    nav: '[role=navigation]',
  },
  reportDir: './scenetest-reports',
  reportFormat: 'html',
})
```

### Actor teams

Define actor credentials in `actors.ts` (array of teams) or `actors/*.ts` (one file per team) next to your config:

```typescript
// actors.ts
export default [
  // Team 1
  {
    user: { id: '1', username: 'alice', email: 'alice@test.com', password: 'pass1' },
    admin: { id: '2', username: 'bob', email: 'bob@test.com', password: 'pass2' },
  },
  // Team 2 (for parallel execution)
  {
    user: { id: '3', username: 'carol', email: 'carol@test.com', password: 'pass3' },
    admin: { id: '4', username: 'dave', email: 'dave@test.com', password: 'pass4' },
  },
]
```

Teams enable parallel scene execution — each scene acquires a team, so scenes using different teams run concurrently without data conflicts.

---

## Selector Resolution

The actor DSL uses a selector string that resolves against DOM attributes in priority order:

1. `aria-label`
2. `id`
3. `data-testid`
4. `data-name`
5. `data-key`
6. `name`

**Nested selectors** use spaces: `'modal form submit-button'` descends from modal to form to submit-button.

**Implicit key matching**: `'playlist-row 12345 like-button'` — if the matched `playlist-row` element has `data-key="12345"`, the key token is consumed without descending. Then `like-button` is found as a child.

**Sigils**:
- `~alias` — Resolves from the `aliases` config (e.g., `~modal` → `[role=dialog]`)
- `@label` — Explicit aria-label match (e.g., `@Close` → `[aria-label="Close"]`)

**Debugging**: `explainSelector(page, 'my-selector')` returns match info and suggestions.

## Text DSL

Scenes can also be written as string arrays for simpler flows:

```typescript
import { runDsl } from '@scenetest/cli'

await runDsl(user, [
  'openTo /login',
  'see login-form',
  'typeInto email alice@test.com',
  'typeInto password secret',
  'click submit',
  'see dashboard',
])
```

**Macros** allow reuse:

```typescript
import { defineMacro, runMacro } from '@scenetest/cli'

defineMacro('login', [
  'openTo /login',
  'see login-form',
  'typeInto email {{email}}',
  'typeInto password {{password}}',
  'click submit',
  'see dashboard',
])

await runMacro(user, 'login', { email: 'alice@test.com', password: 'secret' })
```

## Actor DSL Methods

| Method | Description |
|--------|-------------|
| `openTo(url)` | Navigate to URL (full page load) |
| `see(selector)` | Wait for element visible, set as current scope |
| `notSee(selector)` | Wait for element hidden/detached |
| `seeText(text)` | Wait for text visible on page |
| `seeToast(selector)` | Wait for element to appear then disappear |
| `click(selector)` | Click within current scope |
| `typeInto(selector, value)` | Fill input within current scope |
| `check(selector)` | Check checkbox |
| `select(selector, value)` | Select dropdown option |
| `wait(ms)` | Wait milliseconds |
| `emit(message)` | Emit to message bus (for multi-actor coordination) |
| `do(fn)` | Execute custom function with Playwright page |
| `up(selector)` | Navigate to ancestor matching selector |
| `prev()` | Return to previous scope |
| `if(selector, callback)` | Conditional watcher (cleared after each await) |
| `warnIf(selector, message)` | Script warning (persists across scene) |

All methods (except `if` and `warnIf`) return an `ActionChain` that is chainable and thenable (await the chain to execute).

## Multi-Actor Coordination

The `when()` function and `emit()` method coordinate actors via a sticky message bus:

```typescript
import { scene, when } from '@scenetest/cli'

scene('sender and receiver', async ({ actor }) => {
  const sender = await actor('sender')
  const receiver = await actor('receiver')

  // receiver waits until sender has logged in
  when('sender-ready', async () => {
    await receiver.openTo('/inbox')
    await receiver.seeText('New message')
  })

  await sender.openTo('/login')
  // ... login flow ...
  await sender.emit('sender-ready')
  await sender.see('compose').typeInto('body', 'Hello!').click('send')
})
```

---

## Key Source Files

### Core (`packages/scenetest/src/`)
- `assertions.ts` — `should()`, `failed()`, `assert()` (stub), `match()`
- `runtime.ts` — `__scenetest_rpc()` client for multi-context assertions
- `types.ts` — `AssertionResult`, `ServerContext`, RPC types

### CLI (`packages/scenetest-cli/src/`)
- `scene.ts` — `scene()` registration, `when()` coordination, `runScene()`
- `actor.ts` — `ActorHandleImpl` with all DSL methods, `ActionChainImpl` with scope tracking
- `selectors.ts` — `resolveSelector()`, `explainSelector()`, alias registry
- `dsl.ts` — `runDsl()`, `defineMacro()`, `runMacro()`, text DSL parser
- `message-bus.ts` — `MessageBus` with sticky messages
- `team-manager.ts` — `TeamManager` with pool acquire/release for parallel execution
- `runner.ts` — `SceneRunner` with scene discovery, browser init, lifecycle hooks
- `cli.ts` — CLI entry point, report generation (HTML/JSON)
- `config.ts` — `loadConfig()`, `findConfigFile()`, `defineConfig()`, team discovery
- `types.ts` — All type definitions (`ScenetestConfig`, `ActorHandle`, `ActionChain`, etc.)

### Vite Plugin (`packages/vite-plugin/src/`)
- `index.ts` — Main plugin (dev: inject observer + middleware; prod: strip)
- `strip.ts` — AST-based removal of scenetest imports and calls
- `transform.ts` — Extract `assert()` serverFn bodies for RPC
- `middleware.ts` — `/__scenetest/run` endpoint, AsyncLocalStorage for result collection
- `virtual-module.ts` — Virtual module system for extracted assertions
- `config.ts` — Plugin config loading

### Observer (`packages/observer/src/`)
- `index.ts` — `initObserver()`, assertion handler
- `panel.ts` — Floating panel UI
- `fullscreen.ts` — Fullscreen viewer with grouped/location/sequence views
- `state.ts` — Global state (groups, history, stats)
- `history.ts` — Assertion history tracking, flaky detection
- `render.ts` — HTML rendering
- `audio.ts` — Audio feedback (chords per group)
- `styles.ts` — Injected CSS

### Playwright (`packages/playwright-scenetest/src/`)
- `fixtures.ts` — `scenePage` fixture, `waitForAssertions()`, failure logging

### Example App (`packages/example-app-react/src/`)
- `App.tsx` — Working example with `should()`, `failed()`, `useTestEffect`, multi-context comparisons

---

## Vite Plugin

- **Dev mode**: Injects observer script via `transformIndexHtml`, registers RPC middleware
- **Production**: Strips all scenetest-* package imports and calls via Babel AST transform
- **Packages stripped**: scenetest, scenetest-react, scenetest-vue, scenetest-solid, scenetest-svelte
- **Plugin options**: `strip` (force), `devPanel` (show observer), `demo` (keep code + panel in prod), `csp` (Content-Security-Policy config)
- **CSP**: Configurable middleware, default directives with 'unsafe-inline' for dev panel

## Observer Dev Panel

- Floating panel with pass/fail counts and expandable assertion list
- Assertions batched into groups by timing (50ms threshold)
- Three view modes: grouped, by location, sequence
- History tracking with "(N prior, M after)" stats and flaky detection
- Context shown in tooltip (panel) or inline (fullscreen)
- Click-to-editor via Vite's `/__open-in-editor`
- Audio feedback with mute/volume controls
- Fullscreen viewer

## Playwright Fixtures

- Custom `scenePage` fixture with `page.exposeFunction('__scenetest_report')`
- Provides `.assertions`, `.passed`, `.failed` arrays
- `waitForAssertions(timeout)` polls for pending RPC calls
- Logs failures at end of test

---

## What's Not Yet Implemented

| Feature | Status | Design doc |
|---------|--------|-----------|
| `assert()` multi-context (server-side assertions) | Stubbed, infrastructure scaffolded, not wired E2E | `server-actions.md` |
| Network layer (`network.fail()`, `network.mock()`) | Design only | `cli-v2.md` section 7 |
| Snapshots (`snapshot()`, `expectSnapshot()`) | Design only | `cli-v2.md` section 8 |
| Dashboard & JSONL reports | Design only | `dashboard.md` |
| Interactive UI mode (`--ui`) | Stub only | `cli-v2.md` |
| Visualization (timeline/musical) | Conceptual | `cli-v2.md` section 10 |
