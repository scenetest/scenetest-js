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
pnpm -r test          # Run all unit tests across packages
```

## Package Structure

```
packages/
├── scenetest/              # Core library - should(), failed(), assert(), match()
├── scenetest-react/        # React bindings - useTestEffect hook (re-exports core)
├── scenetest-vue/          # Vue bindings - watchTestEffect composable (re-exports core)
├── scenetest-solid/        # Solid bindings - createTestEffect primitive (re-exports core)
├── scenetest-svelte/       # Svelte bindings - testEffect helper (re-exports core)
├── scenetest-cli/          # CLI runner - scene(), flow(), actor DSL, selectors, teams, config
├── vite-plugin/            # Vite plugin - dev panel injection, prod stripping, RPC middleware
├── observer/               # Dev panel UI - floating panel, fullscreen, history, audio
├── playwright-scenetest/   # Playwright fixtures (scenePage, assertions)
├── example-app-react/      # React demo app with working Scene tests
├── example-app-vue/        # Vue demo app
├── example-app-solid/      # Solid demo app
└── example-app-svelte/     # Svelte 5 demo app
```

---

## Writing Tests with Scenetest

**For writing scene specs and inline assertions, see [`docs/public/design/writing-tests.md`](docs/public/design/writing-tests.md).** That guide covers both authoring models (`scene()` and `flow()`), the actor DSL, selector resolution, configuration, teams, and the text DSL. It is designed to be self-contained — copy it into your application repo's CLAUDE.md or reference it directly.

**For the design rationale behind the two execution models, see [`docs/public/design/scene-vs-flow.md`](docs/public/design/scene-vs-flow.md).**

### Architecture note for contributors

There are two scene-authoring models with separate implementations:

- **`scene()`** — await-driven sequential orchestration. Implemented in `actor.ts` (`SequentialActorHandleImpl`, `ActionChainImpl`).
- **`flow()`** — reactive concurrent draining. Implemented in `reactive.ts` (`ConcurrentActorHandleImpl`, `drainAll()`).

Both register through the same `sceneRegistry` in `scene.ts`. The runner (`runner.ts`) does not know which model a scene uses. Before 1.0, one model will be removed — see `scene-vs-flow.md` for the decision criteria and what needs to be ripped out for each path.

---

## Key Source Files

### Core (`packages/scenetest/src/`)
- `assertions.ts` — `should()`, `failed()`, `assert()` (stub), `match()`
- `runtime.ts` — `__scenetest_rpc()` client for multi-context assertions
- `types.ts` — `AssertionResult`, `ServerContext`, RPC types

### CLI (`packages/scenetest-cli/src/`)
- `scene.ts` — `scene()` registration, `when()` coordination, `runScene()`
- `actor.ts` — `SequentialActorHandleImpl` with all DSL methods, `ActionChainImpl` with scope tracking (scene model)
- `reactive.ts` — `ConcurrentActorHandleImpl`, `drainAll()`, `flow()` registration (flow model)
- `selectors.ts` — `resolveSelector()`, `explainSelector()`, alias registry
- `dsl.ts` — `runDsl()`, `defineMacro()`, `runMacro()`, text DSL parser
- `message-bus.ts` — `MessageBus` with sticky messages
- `team-manager.ts` — `TeamManager` with pool acquire/release for parallel execution
- `runner.ts` — `SceneRunner` with scene discovery, browser init, lifecycle hooks
- `cli.ts` — CLI entry point, report generation (HTML/JSON)
- `config.ts` — `loadConfig()`, `findConfigFile()`, `defineConfig()`, team discovery
- `types.ts` — All type definitions (`ScenetestConfig`, `SequentialActorHandle`, `ActionChain`, `ConcurrentActorHandle`, `FlowContext`, etc.)

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
