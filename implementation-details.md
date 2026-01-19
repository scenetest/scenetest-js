# Implementation Details

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

### Button Layout
- **Main panel:** `[all|errors]` | `[grouped|collapsed]` | `fullscreen` | `clear`
- **Fullscreen:** `[All|Errors|Passes]` | `[Grouped|Collapsed]` | `Clear`

### Grouped/Collapsed Toggles
- **Grouped:** Shows assertions batched by timing (50ms threshold)
- **Collapsed:** When active, new groups start collapsed; toggling collapses/expands all
- State syncs between main panel and fullscreen window

### Context Display
- Small panel: Context shown in tooltip only (title attribute)
- Fullscreen: Context displayed inline

### Assertion History Tracking
- Tracks assertions by description via `history.ts`
- Shows pattern like "(3 prior ✓, 2 after ✓)" or "(5 prior (3✓ 2✗))"
- Displayed via `.scenetest-history` class

## Core Package (scenetest)

- `pass(description, condition, context?)` - Passes when condition is true
- `fail(description, condition, context?)` - Passes when condition is false
- Both call `window.__scenetest_report` if available
- Captures stack trace for click-to-open in editor

## Vite Plugin

- **Dev mode:** Leaves code as-is, injects dev panel via `transformIndexHtml`
- **Production:** Strips all scenetest imports and calls via AST transform
- Uses @babel/parser + @babel/traverse + magic-string
- 30 unit tests covering edge cases

## Playwright Fixtures

- Custom `scenePage` fixture with `page.exposeFunction('__scenetest_report')`
- Provides `.assertions`, `.passed`, `.failed` arrays
- Logs failures at end of test
