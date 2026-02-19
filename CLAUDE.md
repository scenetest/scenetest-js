# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Scenetest is a scene-driven, concurrent-actor end-to-end testing framework for Javascript apps, with inline checks and simpler specs.

**Scenetest is working implementation, but the API is not stable.**  We have a CLI runner based on Playwright, a simple inline assertion system, actors-based spec DSL, Vite plugin, reporting system, and dev panel. The `serverCheck()` multi-context feature (server-side assertions) is stubbed but not yet wired end-to-end; everything else is functional.

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
├── checks/                 # Core library — should(), failed(), serverCheck(), match(), observer, playwright fixtures
├── checks-react/           # React bindings — useCheck hook (re-exports checks)
├── checks-vue/             # Vue bindings — watchCheck composable (re-exports checks)
├── checks-solid/           # Solid bindings — createCheck primitive (re-exports checks)
├── checks-svelte/          # Svelte bindings — checkEffect helper (re-exports checks)
├── scenes/                 # CLI runner — scene(), test(), actor DSL, selectors, teams, config, recorder
├── vite-plugin/            # Vite plugin — dev panel injection, prod stripping, RPC middleware
├── eslint-plugin/          # ESLint plugin — prefer-aria-label rule
├── vscode-scenetest/       # VS Code extension — syntax highlighting for .spec.md scene specs
├── example-app-react/      # React demo app with working Scene tests
├── example-app-vue/        # Vue demo app
├── example-app-solid/      # Solid demo app
└── example-app-svelte/     # Svelte 5 demo app
```

---

## Writing Tests with Scenetest

**For writing scene specs and inline assertions, see [`docs/public/design/writing-tests.md`](docs/public/design/writing-tests.md).** That guide covers both authoring models (`scene()` concurrent and `test()` classic driver), the actor DSL, and links to canonical references for selectors, text DSL format, and execution models. It is designed to be self-contained — copy it into your application repo's CLAUDE.md or reference it directly.

**For the design rationale behind the two execution models, see [`docs/public/design/scene-vs-flow.md`](docs/public/design/scene-vs-flow.md).**

### Architecture note for contributors

There are two scene-authoring models with separate implementations:

- **`test()`** — await-driven sequential orchestration (classic driver). Implemented in `actor.ts` (`SequentialActorHandleImpl`, `ActionChainImpl`).
- **`scene()`** — reactive concurrent draining (concurrent model). Implemented in `reactive.ts` (`ConcurrentActorHandleImpl`, `drainAll()`).

Both register through the same `sceneRegistry` in `scene.ts`. The runner (`runner.ts`) does not know which model a scene uses. Before 1.0, one model will be removed — see `scene-vs-flow.md` for the decision criteria and what needs to be ripped out for each path.

---

## Key Source Files

### Checks (`packages/checks/src/`)
- `assertions.ts` — `should()`, `failed()`, `serverCheck()` (stub), `match()`
- `runtime.ts` — `__scenetest_rpc()` client for multi-context assertions
- `types.ts` — `AssertionResult`, `ServerContext`, RPC types
- `index.ts` — `initObserver()`, assertion handler
- `panel.ts` — Floating panel UI
- `fullscreen.ts` — Fullscreen viewer with grouped/location/sequence views
- `state.ts` — Global state (groups, history, stats)
- `history.ts` — Assertion history tracking, flaky detection
- `render.ts` — HTML rendering
- `audio.ts` — Audio feedback (chords per group)
- `styles.ts` — Injected CSS
- `fixtures.ts` — `scenePage` fixture, `waitForAssertions()`, failure logging

### Scenes (`packages/scenes/src/`)
- `scene.ts` — `scene()` and `test()` registration, `runScene()`
- `actor.ts` — `SequentialActorHandleImpl` with all DSL methods, `ActionChainImpl` with scope tracking (classic driver model)
- `reactive.ts` — `ConcurrentActorHandleImpl`, `drainAll()`, `scene()` registration (declarative model)
- `selectors.ts` — `resolveSelector()`, `explainSelector()`, alias registry
- `dsl.ts` — `runDsl()`, `defineMacro()`, `runMacro()`, text DSL parser
- `message-bus.ts` — `MessageBus` with sticky messages
- `team-manager.ts` — `TeamManager` with pool acquire/release for parallel execution
- `runner.ts` — `SceneRunner` with scene discovery, browser init, lifecycle hooks
- `cli.ts` — CLI entry point, report generation (HTML/JSON)
- `keyboard.ts` — `NavigationModeRotation`, `tabToElement()`, `pressEnter()`, `clearAndType()`, fuzzy-finger helpers (`fuzzyFingerClick`, `fuzzyFingerFill`, `fuzzyFingerCheck`), `FuzzyFingerError`
- `config.ts` — `loadConfig()`, `findConfigFile()`, `defineConfig()`, team discovery
- `types.ts` — All type definitions (`ScenetestConfig`, `SequentialActorHandle`, `ActionChain`, `ConcurrentActorHandle`, `SceneContext`, etc.)

### Vite Plugin (`packages/vite-plugin/src/`)
- `index.ts` — Main plugin (dev: inject observer + middleware; prod: strip)
- `strip.ts` — AST-based removal of scenetest imports and calls
- `transform.ts` — Extract `serverCheck()` serverFn bodies for RPC
- `middleware.ts` — `/__scenetest/run` endpoint, AsyncLocalStorage for result collection
- `virtual-module.ts` — Virtual module system for extracted assertions
- `config.ts` — Plugin config loading

### ESLint Plugin (`packages/eslint-plugin/src/`)
- `index.ts` — Plugin entry, `recommended` flat config preset
- `rules/prefer-aria-label.ts` — Rule: prefer `aria-label` over `data-testid` for selectors

### VS Code Extension (`packages/vscode-scenetest/`)
- `package.json` — Extension manifest (language ID `scenetest-spec`, grammar registration)
- `syntaxes/scenetest-spec.tmLanguage.json` — TextMate grammar for `.spec.md` scene specs
- `language-configuration.json` — Comment toggling, folding, bracket config

### Example App (`packages/example-app-react/src/`)
- `App.tsx` — Working example with `should()`, `failed()`, `useCheck`, multi-context comparisons

---

## Vite Plugin

- **Dev mode**: Injects observer script via `transformIndexHtml`, registers RPC middleware
- **Production**: Strips all @scenetest/* package imports and calls via Babel AST transform
- **Packages stripped**: checks, checks-react, checks-vue, checks-solid, checks-svelte
- **Plugin options**: `strip` (force), `devPanel` (show observer), `demo` (keep code + panel in prod), `csp` (Content-Security-Policy config)
- **CSP**: Opt-in middleware (`csp: true`), disabled by default to avoid breaking external resources (Google Fonts, CDNs, etc.)

### Dev panel injection architecture

The observer and recorder panels are injected into the consumer's dev page using Vite's **virtual module pattern** — NOT custom middleware routes. This is important and was learned the hard way:

- `transformIndexHtml` injects `<script type="module" src="/@scenetest/observer.js">` (external script tag)
- `resolveId` intercepts `/@scenetest/observer.js` and returns it as a virtual module
- `load` returns bootstrap code: `import '@scenetest/checks-panel/auto'`
- `resolveId` also intercepts `@scenetest/checks-panel/auto` and resolves it via `import.meta.resolve()` — this handles **pnpm strict hoisting** where transitive deps aren't visible from the consumer's project root

**Why not middleware?** Previous approaches tried to serve the observer via a custom middleware route that manually called `server.transformRequest()`. This broke because:
1. `createRequire` (CJS resolution) can't match `import`-only package.json exports
2. `server.transformRequest()` with `/@fs/` paths fails for symlinked workspace packages outside the consumer's `server.fs.allow` scope
3. Inline `<script type="module">import 'bare-spec'</script>` fails because the browser parses bare specifiers *before* Vite can transform them

**The correct pattern:** `resolveId` + `load` virtual modules with `<script src="">` tags. The browser requests the URL → Vite intercepts → plugin pipeline resolves bare imports. This is the standard approach used by vite-plugin-inspect, vite-plugin-pwa, and @vitejs/plugin-react.

### @babel/traverse type compatibility

`@types/babel__traverse@7.28+` changed the default export type to a namespace (not callable). The runtime ESM/CJS interop works fine, but TypeScript complains. We cast through `_traverse.TraverseOptions` instead of `typeof _traverse`.

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
| `serverCheck()` multi-context (server-side assertions) | Stubbed, infrastructure scaffolded, not wired E2E | `server-actions.md` |
| Network layer (`network.fail()`, `network.mock()`) | Design only | `cli-v2.md` section 7 |
| Snapshots (`snapshot()`, `expectSnapshot()`) | Design only | `cli-v2.md` section 8 |
| Dashboard & JSONL reports | Design only | `dashboard.md` |
| Interactive UI mode (`--ui`) | Stub only | `cli-v2.md` |
| Visualization (timeline/musical) | Conceptual | `cli-v2.md` section 10 |
