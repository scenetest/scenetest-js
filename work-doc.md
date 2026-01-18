# WORKING DOC FOR PRIMARY DEVELOPER

## Progress so far:

- [x] Research Playwright and Cypress architectures
- [x] Decide on Playwright for POC (see research notes below)
- [x] Create project structure (monorepo with pnpm workspaces)
- [x] Implement core `scenetest` package with `pass`/`fail` functions
- [x] Implement Vite plugin (runtime detection for dev mode)
- [x] Implement Playwright fixtures for assertion collection
- [x] Create example app to test against
- [x] Write first Scene that uses Inline Assertions
- [x] **POC WORKING!** Tests pass, 37 assertions collected
- [x] **AST-based code stripping** - Production builds strip all scenetest code (30 unit tests)

## Instructions for the coding agent

Under normal circumstances you will start by looking through the document for items that are pending or in an otherwise "ready" state, and then you'll attempt to do it! Go in whatever order you think is _most important_. (Revert your changes and move on after 3 missed attempts.) If you think you've succeeded at an item, run the tests and the linters, and fix things until they pass. It's very important after every item, whether you completed it, or just did some research, or tried and failed, you must add a DIFFICULTY score (1-to-4) underneath the COMPLEXITY score. (It does NOT have to be the same; it is used to give us information about when we have guessed incorrectly.) Then add whatever notes you want, for later, git commit, and move on. If the commit fails, fix any errors and commit again. If you make migrations, you can run `pnpm db-full` to run the migrations and update the types, but then you have to STOP and ask the human manager to handle the changes to the `base.sql` schema. But so when you're done, regardless of the status, update the item with a new status, difficulty, and your notes, and move on to the next one. You do not have to go in any order. If something is large enough to warrant its own project doc, like a difficulty of 3 or 4, then make your own project doc and wait for human feedback before moving ahead to implementation.

If you have been instructed to do a BIG ITEMS PASS, then do one thing differently: start first by looking at the items that are marked as BIG ITEMS, or that you can see require analysis or have a complexity of 3 or 4. Otherwise, work through the doc item by item picking the ones most relevant to you, as you normally would, but not writing any code or doing any git commits, simply leaving your analysis and plans on these items and moving on.

---

## Research Notes

### Playwright vs Cypress for POC

**Recommendation: Playwright**

| Aspect | Playwright | Cypress |
|--------|------------|---------|
| Async model | Native async/await | Chained commands, custom promise handling |
| Script injection | `page.addInitScript()` persists across navigations | More complex, scripts lost on navigation |
| Browser-to-Node communication | `page.exposeFunction()` - clean callback exposure | `cy.task()` - works but more ceremony |
| Extensibility | Fixtures system - composable, scoped | Custom commands - simpler but less flexible |
| TypeScript | First-class support | Supported but quirks with config types |

**Key Playwright APIs for Scenetest:**
- `page.addInitScript(script)` - Inject assertion reporting code that survives navigation
- `page.exposeFunction(name, callback)` - Expose `__scenetest_report` to browser
- `test.extend()` - Create custom fixtures for assertion collection
- `page.evaluate()` - Run code in browser context when needed

### Vite Plugin Strategy

The Vite plugin needs to:
1. **Dev/Test mode**: Transform `pass()`, `fail()`, `assertion()` to execute + report
2. **Production mode**: Strip all scenetest code entirely

Key Vite plugin hooks:
- `transform(code, id)` - Modify source code
- `config()` - Detect mode (dev/prod/test)
- `apply: 'build'` or `apply: 'serve'` - Conditional application

---

## POC Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer's App                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Component.tsx                                            │  │
│  │  ─────────────────                                        │  │
│  │  import { pass } from 'scenetest'                         │  │
│  │                                                           │  │
│  │  function ProfileForm() {                                 │  │
│  │    const profile = useProfile()                           │  │
│  │    pass('profile loaded without pending', profile !== undefined) │
│  │    ...                                                    │  │
│  │  }                                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    vite-plugin-scenetest                        │
│  ─────────────────────────────────────────────────────────────  │
│  Transforms pass() calls:                                       │
│                                                                 │
│  DEV/TEST:  pass('msg', cond)                                   │
│         →  __scenetest_report({ type: 'pass', msg, result: cond })│
│                                                                 │
│  PROD:      pass('msg', cond)                                   │
│         →  (stripped entirely)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (during test)                        │
│  ─────────────────────────────────────────────────────────────  │
│  window.__scenetest_report = (exposed by Playwright)            │
│                                                                 │
│  When pass() executes in component:                             │
│    → calls window.__scenetest_report()                          │
│    → sends result to Node.js test runner                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 @scenetest/playwright                           │
│  ─────────────────────────────────────────────────────────────  │
│  Custom fixture that:                                           │
│    1. Injects __scenetest_report via exposeFunction()           │
│    2. Collects all assertion results                            │
│    3. Provides scenePage fixture with assertion-aware methods   │
│    4. Reports aggregated results at scene end                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Structure (Monorepo)

```
packages/
├── scenetest/                 # Core library - exports pass, fail, assertion, scene
│   ├── src/
│   │   ├── index.ts           # Main exports
│   │   ├── assertions.ts      # pass, fail implementations
│   │   └── scene.ts           # scene.play() API
│   └── package.json
│
├── vite-plugin-scenetest/     # Vite plugin for code transformation
│   ├── src/
│   │   ├── index.ts           # Plugin entry
│   │   └── transform.ts       # AST transformation logic
│   └── package.json
│
├── playwright-scenetest/      # Playwright fixtures and helpers
│   ├── src/
│   │   ├── index.ts           # Main exports
│   │   ├── fixtures.ts        # Custom test fixtures
│   │   └── reporter.ts        # Assertion result aggregation
│   └── package.json
│
└── example-app/               # Test app for POC validation
    ├── src/
    │   └── App.tsx            # Simple app with inline assertions
    ├── tests/
    │   └── example.scene.ts   # Example scene
    ├── vite.config.ts
    └── playwright.config.ts
```

---

## Items To Work On

### 1. Project Setup
- **Status**: DONE
- **Complexity**: 2
- **Difficulty**: 2
- **Notes**: pnpm workspaces, root tsconfig, 4 packages scaffolded

### 2. Core `scenetest` Package
- **Status**: DONE
- **Complexity**: 2
- **Difficulty**: 1
- **Notes**: `pass()` and `fail()` call `window.__scenetest_report` if available. Also captures stack trace for debugging.

### 3. Vite Plugin - AST Transform
- **Status**: DONE
- **Complexity**: 3
- **Difficulty**: 3
- **Notes**: Full AST-based stripping using @babel/parser + @babel/traverse + magic-string. 30 unit tests covering edge cases (imports, aliases, namespace imports, JSX, TypeScript, expression contexts). Production build strips all scenetest code. Dev mode leaves code as-is for runtime detection.

### 4. Playwright Fixtures
- **Status**: DONE
- **Complexity**: 3
- **Difficulty**: 2
- **Notes**: Custom `scenePage` fixture with `page.exposeFunction('__scenetest_report')`. Provides `.assertions`, `.passed`, `.failed` arrays. Logs failures at end of test.

### 5. Example App
- **Status**: DONE
- **Complexity**: 1
- **Difficulty**: 1
- **Notes**: React + Vite app with ProfileForm component. Uses `pass()` and `fail()` inline assertions.

### 6. First Working Scene
- **Status**: DONE
- **Complexity**: 2
- **Difficulty**: 2
- **Notes**: Two tests - one for happy path (37 assertions collected!), one for validation failure. Both pass. Inline assertions are successfully collected by the fixture.

### 7. Multi-Context Assertions (assertion() API)
- **Status**: PENDING
- **Complexity**: 4
- **Tags**: BIG ITEM
- **Description**: The `assertion({ assertFn, appData })` API is more complex:
  - `appData` runs in browser, collects data
  - `assertFn` runs in Node.js with server access
  - Need to serialize appData and send to Node
  - This is the "server action" pattern from the README
  - **Needs separate design doc before implementation**

---

## Open Questions

1. **Assertion timing**: How do we know when to "wait" for assertions? The README mentions awaiting `form.submit()` should wait for assertions triggered by onSettled. Need to design a mechanism for this.

2. **Assertion identity**: How do we dedupe assertions that fire multiple times (e.g., on re-render)? Do we want to?

3. **Error handling**: If an assertion throws, should it break the scene flow or just record a failure?

- record a failure. our scenes are not to be messed with by our inline assertions.

4. **Reporter format**: What format should assertion results take? Need to integrate with Playwright's reporter system.
