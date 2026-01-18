# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Scenetest is currently a **concept document only** - no implementation exists yet. The README.md contains the full design specification.

## Core Concept

Scenetest is a proposed JavaScript testing framework that separates two distinct concerns in end-to-end testing:

1. **Scenes**: Testing user journeys and flows through browser orchestration
2. **Inline Assertions**: Multi-context assertions comparing data across browser, local storage, and database - living inside application code rather than separate spec files

## Key Design Principles

- **Inline Assertions live in app code**: Tests live inside components/hooks, not separate spec files
- **Decoupled Scenes from Assertions**: Scene orchestration is separate from assertion logic
- **Test the product, not the tests**: Assertions use actual component state/props, not duplicated test logic
- **Passive evaluation**: Assertions run whenever code is hit in test/dev mode, whether by automated actors or manual clicking

## Proposed API

- `pass(description, condition)` - Inline Assertion that passes when condition is true
- `fail(description, condition)` - Inline Assertion that fails when condition is true
- `assertion({ title, assertFn, appData })` - Multi-context Inline Assertion comparing client and server data
- `scene.play({ title, prepareScene, cleanupScene, sceneFn })` - Scene definition for user flows

## Architecture Notes

The design draws from:
- Playwright's `page.evaluate` for cross-context data access
- React Server Actions pattern for the `assertion` API
- Vitest's in-source testing concept (but extended to run in-app, not just in-closure)
