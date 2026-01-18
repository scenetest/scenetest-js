# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Scenetest has a **working proof-of-concept** implementation. The README.md contains the design specification, and `work-doc.md` tracks implementation progress.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run Playwright tests (example-app)
pnpm dev              # Start example app dev server
pnpm typecheck        # Type check all packages
```

## Package Structure

```
packages/
├── scenetest/              # Core library - pass(), fail() functions
├── vite-plugin-scenetest/  # Vite plugin for build integration
├── playwright-scenetest/   # Playwright fixtures (scenePage, assertions)
└── example-app/            # Demo app with working Scene tests
```

## Core Concept

Scenetest separates two distinct concerns in end-to-end testing:

1. **Scenes**: Testing user journeys and flows through browser orchestration
2. **Inline Assertions**: Assertions that live inside application code (components/hooks), not separate spec files

## How It Works

1. **In app code**: Use `pass()` and `fail()` from `scenetest` package
2. **At runtime**: These check for `window.__scenetest_report` and report if available
3. **In tests**: Use `scenePage` fixture from `playwright-scenetest` which exposes the reporter
4. **Result**: All inline assertions from app code are collected in `scenePage.assertions`

## Key Files

- `packages/scenetest/src/assertions.ts` - Core pass/fail implementation
- `packages/playwright-scenetest/src/fixtures.ts` - Playwright fixtures
- `packages/example-app/src/App.tsx` - Example component with inline assertions
- `packages/example-app/tests/profile.scene.ts` - Example Scene test
