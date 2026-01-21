# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Scenetest has a **working proof-of-concept** implementation. The README.md contains the design specification, and `work-doc.md` tracks implementation progress.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Start example app dev server
pnpm dev:rebuild      # Rebuild plugin then start dev server
pnpm typecheck        # Type check all packages
```

## Package Structure

```
packages/
├── scenetest/              # Core library - pass(), fail(), assert() (framework-agnostic)
├── scenetest-react/        # React bindings - useAssert hook (re-exports core)
├── vite-plugin-scenetest/  # Vite plugin for build integration
├── playwright-scenetest/   # Playwright fixtures (scenePage, assertions)
└── example-app/            # Demo app with working Scene tests
```

## Core Concept

Scenetest separates two distinct concerns in end-to-end testing:

1. **Scenes**: Testing user journeys and flows through browser orchestration
2. **Inline Assertions**: Assertions that live inside application code (components/hooks), not separate spec files

## How It Works

1. **In app code**: Use `pass()` and `fail()` from `scenetest` (or `scenetest-react` for React apps with `useAssert` hook)
2. **At runtime**: These check for `window.__scenetest_report` and report if available
3. **In tests**: Use `scenePage` fixture from `playwright-scenetest` which exposes the reporter
4. **Result**: All inline assertions from app code are collected in `scenePage.assertions`

## Key Files

- `packages/scenetest/src/assertions.ts` - Core pass/fail implementation
- `packages/playwright-scenetest/src/fixtures.ts` - Playwright fixtures
- `packages/example-app/src/App.tsx` - Example component with inline assertions

---

## Dev Panel Architecture

The dev panel is built as proper TypeScript modules in `packages/vite-plugin-scenetest/src/dev-panel/`:

```
src/dev-panel/
├── types.ts      # Type definitions (AssertionResult, AssertionGroup, etc.)
├── state.ts      # Shared state management
├── history.ts    # Assertion history tracking
├── utils.ts      # Utility functions (escapeHtml, formatters, etc.)
├── styles.ts     # CSS styles as constants
├── render.ts     # HTML rendering functions
├── panel.ts      # Main floating panel UI
├── fullscreen.ts # Fullscreen window management
└── index.ts      # Entry point (IIFE wrapper)
```

**Build process:**
1. `scripts/bundle-dev-panel.mjs` bundles TypeScript via esbuild into IIFE
2. Output goes to `src/dev-panel.generated.ts`
3. Main plugin imports from generated file
4. Run `pnpm dev:rebuild` to rebuild plugin and restart dev server

## Dev Panel Features

- **Grouped:** Assertions batched by timing (50ms threshold)
- **Context:** Shown in tooltip (small panel) or inline (fullscreen)
- **History:** Tracks assertion runs, shows "(3 prior ✓, 2 after ✓)"
- **Click-to-open:** Source locations link to editor via Vite's `/__open-in-editor`

## Vite Plugin

- **Dev mode:** Leaves code as-is, injects dev panel via `transformIndexHtml`
- **Production:** Strips all scenetest/scenetest-react imports and calls via AST transform
- Uses @babel/parser + @babel/traverse + magic-string
- 33 unit tests covering edge cases

## Playwright Fixtures

- Custom `scenePage` fixture with `page.exposeFunction('__scenetest_report')`
- Provides `.assertions`, `.passed`, `.failed` arrays
- Logs failures at end of test
