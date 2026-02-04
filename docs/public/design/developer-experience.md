# Developer Experience Add-ons

> **Status:** Design document for optional tooling that improves the authoring experience for scenetest specs. None of these are required for scenetest to function.

---

## Overview

Scenetest's text DSL (`.spec.md` files) is designed to be human-readable and GitHub-renderable. However, raw text lacks the ergonomics that developers expect from modern tooling:

- No syntax highlighting
- No autocomplete for selectors or actors
- No hover information showing resolved selectors or scope state
- No go-to-definition for selectors → components
- No validation until runtime

This document outlines a phased approach to improving the developer experience.

---

## Phase 1: Syntax Highlighting (VS Code Extension)

**Goal:** Make `.spec.md` files visually parseable at a glance.

**Approach:** TextMate grammar that highlights the text DSL within markdown files.

### Token Categories

| Category | Examples | Suggested Scope | Color Intent |
|----------|----------|-----------------|--------------|
| Actions (verbs) | `see`, `click`, `typeInto`, `openTo` | `entity.name.function` | Function call |
| Actor declarations | `user:`, `admin:` | `variable.other` | Variable |
| Selectors | `login-form`, `nav-menu settings` | `string.unquoted` | String |
| Interpolation | `[user.email]` | `variable.interpolation` | Like `${...}` |
| Sigils | `~modal`, `@Close` | `constant.other` | Special constant |
| Comments | `// log in flow` | `comment.line` | Comment |
| Macros | `login()`, `setup() args` | `entity.name.function` | Function call |
| URLs | `/login`, `https://...` | `string.other.link` | Link |
| Numbers | `5000` (wait), `12345` (key) | `constant.numeric` | Number |
| Scene headings | `# group`, `## scene name` | `markup.heading` | Heading |
| Conditional | `if` keyword | `keyword.control` | Keyword |
| Coordination | `emit`, `waitFor` | `keyword.other` | Keyword |

### Grammar Structure

```
scenetest-spec.tmLanguage.json
├── patterns
│   ├── heading (# or ##)
│   ├── actor-declaration (role-name:)
│   ├── comment (// ...)
│   ├── action-line
│   │   ├── action-keyword (see, click, etc.)
│   │   ├── selector-chain (space-separated tokens)
│   │   │   ├── sigil (~alias, @label)
│   │   │   ├── interpolation ([actor.field])
│   │   │   └── plain-selector
│   │   └── value (for typeInto, select, etc.)
│   ├── macro-invocation (name() or name() args)
│   └── conditional-if (if <selector>)
```

### File Association

VS Code will associate `*.spec.md` files with the `scenetest-spec` language ID. This overrides the default markdown association for these specific files.

### Deliverable

A `packages/vscode-scenetest/` directory containing:
- `package.json` with extension metadata
- `syntaxes/scenetest-spec.tmLanguage.json`
- `language-configuration.json` (brackets, comments)
- README with screenshots

Can be published to VS Code marketplace or installed locally via `code --install-extension`.

---

## Phase 2: Language Server (Scope Tracking & Hover)

**Goal:** Provide intelligent hover information and scope visualization.

**Approach:** Language Server Protocol (LSP) implementation that parses specs and tracks scope state.

### Features

1. **Scope tracking hover**
   - Hovering over a selector shows the full scope chain
   - Example: hovering over `click some-link` shows "clicking 'some-link' inside scope 'modal container alert'"
   - Scope is computed by walking the document and tracking `see`, `up`, `prev` actions

2. **Action hover**
   - Hovering over an action shows its signature and description
   - Example: `typeInto <selector> <value> — Fill input element with text`

3. **Actor hover**
   - Hovering over `[user.email]` shows the actor's config values
   - Requires reading `actors.ts` or `actors/*.ts` files

4. **Diagnostics**
   - Warning on unknown actors (not in actors.ts)
   - Warning on undefined macros
   - Error on malformed DSL syntax

### Implementation Notes

The LSP would need to:
1. Parse the `.spec.md` file into an AST
2. Track scope state as a stack of selectors
3. Resolve actor configs from the project's actors files
4. Resolve macros from `defineMacro()` calls in `.spec.ts` files

This is moderate complexity — the DSL parser already exists in `packages/scenes/src/dsl.ts` and could be adapted.

---

## Phase 3: Selector Manifest & Autocomplete

**Goal:** Provide autocomplete for selectors based on the actual codebase.

**Approach:** Build-time extraction of selectable elements, consumed by the language server.

### Manifest Generation

A new CLI command or Vite plugin hook that scans components and extracts:

```json
{
  "selectors": {
    "login-form": {
      "file": "src/components/LoginForm.tsx",
      "line": 12,
      "attribute": "data-testid",
      "element": "form"
    },
    "submit-button": {
      "file": "src/components/LoginForm.tsx",
      "line": 45,
      "attribute": "aria-label",
      "element": "button"
    }
  },
  "aliases": {
    "modal": "[role=dialog]",
    "nav": "[role=navigation]"
  }
}
```

### Extraction Approaches

1. **Static AST analysis** — Parse JSX/TSX/Vue/Svelte files and extract attribute values
   - Fast, works without running the app
   - Misses dynamic values (`data-testid={dynamicId}`)

2. **Runtime extraction** — Instrument the app to report selectable elements during dev
   - Catches dynamic values
   - Requires running the app

3. **Hybrid** — Static extraction with runtime augmentation

### Autocomplete Features

With the manifest, the language server can provide:

1. **Selector autocomplete** — Suggest valid selectors as you type
2. **Go-to-definition** — Jump from selector → component file/line
3. **Find references** — Find all specs using a selector
4. **Rename refactoring** — Rename selector across specs and components
5. **Unused selector warnings** — Selectors defined but never used in specs

---

## Phase 4: ESLint Integration

**Goal:** Catch errors in `.spec.md` files during development and CI.

**Approach:** ESLint plugin that parses and validates text DSL.

### Rules

- `scenetest/valid-action` — Action name is recognized
- `scenetest/known-actor` — Actor is defined in actors.ts
- `scenetest/known-macro` — Macro is defined via defineMacro()
- `scenetest/valid-selector` — Selector matches manifest (if available)
- `scenetest/no-empty-scene` — Scene has at least one action

### Implementation

ESLint plugins can define custom parsers. The plugin would:
1. Parse `.spec.md` files using the DSL parser
2. Expose an AST that ESLint can traverse
3. Implement rules that validate the AST

---

## Other Ideas (Unscoped)

### Scene Recorder

Already implemented in `packages/scene-recorder/`. Records user interactions and generates `.spec.md` output.

### Dashboard & JSONL Reports

See `docs/public/design/dashboard.md`. Aggregate test results, track flaky tests, historical trends.

### Interactive UI Mode

`scenetest --ui` for a visual test runner. Design-only, stub exists.

### Timeline Visualization

Musical/timeline view of concurrent actor actions. Conceptual only.

### Issue Reporter

In-browser widget for reporting issues with automatic context capture. See `docs/public/ideas/` for design notes.

---

## Recommended Implementation Order

1. **Phase 1: Syntax Highlighting** — Immediate value, < 1 day of work
2. **Phase 3: Manifest Generation** — Enables autocomplete, useful standalone for CI validation
3. **Phase 2: Language Server** — Builds on manifest, significant but high-value
4. **Phase 4: ESLint** — Nice to have, can wait

---

## Open Questions

1. **Embedded vs standalone language**: Should `.spec.md` be a "markdown with embedded DSL" or a standalone language? Current design: standalone language ID that takes over `*.spec.md` files.

2. **Monorepo vs separate repo**: Should the VS Code extension live in the scenetest monorepo or a separate repo? Current design: `packages/vscode-scenetest/` in monorepo.

3. **Marketplace publishing**: Publish to VS Code marketplace or recommend local installation? TBD based on adoption.
