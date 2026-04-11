# Changelog

All notable changes to Scenetest are documented here.

---

## [0.7.0] — 2026-04-11

### Dashboard improvements

#### Replay buttons — restart tests from the dashboard

The dashboard now has a **Replay All** button in the header and a per-scene **Replay** button on each scene card. Clicking either triggers a new `scenetest` run via the Vite plugin middleware (`POST /__scenetest/replay`). Single-scene replay passes the scene's file path so only that test re-runs. Buttons are disabled while a run is in progress to prevent concurrent runs.

#### Stop & Pause/Resume controls

While tests are running, **Pause** and **Stop** buttons appear in the header:

- **Pause** suspends the runner process (`SIGSTOP`) and toggles to **Resume** (`SIGCONT`)
- **Stop** kills the runner process and resets the dashboard to idle

#### Progress bar

A thin 3px progress bar sits at the bottom edge of the sticky header, filling left-to-right as scenes complete. Blue while running, green on all-pass, red if any scene fails. Encodes the same information as the "Scenes: 2/5" counter but provides peripheral awareness without reading numbers.

#### Auto-scroll to running scene

When a new scene starts, the dashboard smoothly scrolls it into view so the active timeline stays visible without manual scrolling.

#### Inline error messages

Failed scenes now show a persistent error summary below the swim lanes — the action name and error message are always visible without hovering. The error block shares the bottom border-radius with the swim lanes so the card shape stays clean.

#### Sticky header

The dashboard header is now `position: sticky` so stats, replay controls, and the progress bar remain visible while scrolling through scenes.

### Bug fixes

#### Tooltip z-index on dashboard

Action bar tooltips were clipped behind the time-ruler header row because both `.swim-lanes` and `.lane-track` had `overflow: hidden`. Removed the overflow clipping and bumped tooltip z-index so they render above sibling rows.

---

## [0.6.0] — 2026-04-10

### New features

#### `#N` nth-element selector syntax

Selectors can now include a `#N` token (1-based) to pick the Nth matching element instead of relying on brittle identifiers like UUIDs from seed data:

```markdown
user:
- click feed-phrase-link #1
```

Works mid-chain too — narrow first, then descend:

```markdown
user:
- see table-row #2
- click delete-button
```

Or inline: `click table-row #2 delete-button`.

Available everywhere selectors are used: `.spec.md`, text DSL, and TypeScript API.

#### Browser console error detection

`console.error` messages (and optionally `console.warn`) from the browser are now captured during scene execution and surfaced in the CLI output per-scene and in the run summary. Controlled via the `consoleErrors` config option:

```ts
export default defineConfig({
  consoleErrors: true,       // capture console.error (default)
  consoleErrors: 'warn',    // also capture console.warn
  consoleErrors: false,      // disable entirely
})
```

#### Uncaught JS exception capture

Uncaught exceptions and unhandled promise rejections (`page.on('pageerror')`) are now captured alongside console errors. A `source` field (`'console'` | `'pageerror'`) distinguishes them in reports so the CLI can label them distinctly (e.g. `"uncaught: TypeError: ..."`).

#### `errorSelectors` config — detect error toasts via selectors

New config option watches for visible error elements (toasts, alert banners) across all scenes and actors. When a matching element appears during action execution, a `ConsoleError` with `source: 'selector'` is recorded through the same reporting pipeline as console errors and uncaught exceptions:

```ts
export default defineConfig({
  errorSelectors: [
    { selector: '[role="alert"]', message: 'Unexpected error toast' },
    { selector: '.toast-error',   message: 'Error toast appeared' },
  ],
})
```

CLI output labels these as `error-selector(...)` alongside `console.error`, `console.warn`, and `uncaught` entries.

#### Live dashboard at `/__scenetest/dashboard`

The CLI runner now streams real-time events to the Vite dev server, which fans them out to browser clients via SSE. Open `/__scenetest/dashboard` while scenes are running to see a swim-lane timeline with per-actor action bars, assertion markers, and durations — all updating live.

- **DashboardReporter** in the runner posts events (scene start/end, action start/end, assertions, warnings) to Vite via fire-and-forget HTTP
- **EventHub** in the Vite plugin manages SSE connections with a ring buffer so late-joining clients catch up
- **Dashboard page** is self-contained HTML served by the plugin middleware
- **Dev panel** now includes a "dashboard" link next to the fullscreen button
- Graceful degradation: silently no-ops if the Vite server is unavailable

### Types

- New `ConsoleError` type with `message`, `actor`, `timestamp`, `type` (`'error'` | `'warning'`), `source` (`'console'` | `'pageerror'` | `'selector'`), `url`, and optional `selector` fields
- New `ErrorSelector` type (`{ selector, message }`)
- New `DashboardEvent` union type for runner-to-dashboard event streaming
- `SceneReport` and `RunReport` now include `consoleErrors` arrays and summary counts

---

## [0.5.0] — 2026-04-09

### New features

#### `ifClick` — point-in-time conditional click

New action for dismissing optional UI elements (intro dialogs, onboarding overlays, cookie banners) that may or may not be present. Checks element visibility once, clicks if present, silently skips if not:

```markdown
user:
- ifClick dismiss-intro-dialog
- see dashboard
```

Available in all formats: `.spec.md` (also accepts `if-click` hyphenated form), text DSL, and TypeScript API.

#### Sequential model `if()` pre-check

The sequential model's `if()` watcher now pre-checks element visibility before the action starts, matching the reactive model's existing behavior. Previously it only polled during action execution, which could miss elements that were already visible.

### Bug fixes

#### `@scenetest/checks/runtime` resolution under pnpm strict hoisting

The vite plugin's `serverCheck()` transform injects an import from `@scenetest/checks/runtime`, but consumer apps may only depend on `@scenetest/checks-react` (a transitive dependency). Under pnpm strict hoisting, the bare specifier couldn't resolve. Fixed by adding a `resolveId` hook using the same pattern already used for observer/recorder panel modules.

### Infrastructure

- **CI: parallel unit + e2e jobs** — Unit tests and Playwright e2e tests now run as independent parallel jobs for clearer pass/fail visibility
- **CI: Playwright e2e added** — `pnpm test:e2e` now runs in CI with Chromium, with HTML report uploaded as artifact on failure
- **CI: full unit test coverage** — `test:unit` now runs `pnpm -r test` (all 6 packages, 647 tests) instead of filtering to 3 packages
- **CI: Node.js 24 actions** — Opted into `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` to silence deprecation warnings
- **CI: workflow renamed** — `vitest.yml` → `tests.yml`

---

## [0.4.0] — 2026-04-02

Minor release addressing field feedback from the [sunlo.app](https://sunlo.app) team.
These were blockers or sharp edges they hit writing specs for a Supabase + TanStack Router app.

### New features

#### `setup:` directive for per-scene state seeding

Scenes can now declare a `setup:` expression that runs **after** pre-cleanup
but **before** scene steps. Use it when a scene requires a specific database
state that differs from the seed data baseline:

```markdown
## review mode shows 2-buttons

cleanup: supabase.from('user_deck').update({ review_answer_mode: null }).eq('uid', '[learner.key]').eq('lang', '[team.lang]')
setup: supabase.from('user_deck').update({ review_answer_mode: '2-buttons' }).eq('uid', '[learner.key]').eq('lang', '[team.lang]')

learner:

- openTo /review
- see 2-buttons-mode
```

Execution order: `cleanup (before)` → `setup` → scene steps → `cleanup (after)`.

#### Multiple `cleanup:` (and `setup:`) lines per scene

Multiple `cleanup:` directives are now collected as an array and all executed,
in order. Previously, only the last line was kept.

```markdown
cleanup: supabase.from('request_comment').delete().eq('uid', '[friend.key]')
cleanup: supabase.from('notification').delete().eq('uid', '[learner.key]')
```

#### `[team.field]` interpolation in `cleanup:` / `setup:`

`[team.field]` tokens now resolve correctly in cleanup and setup expressions
using the team's `tags` metadata. Previously only `[role.field]` (actor
credential fields) worked.

```markdown
cleanup: supabase.from('user_deck').update({ review_answer_mode: null }).eq('uid', '[learner.key]').eq('lang', '[team.lang]')
```

Requires the team to define `tags: { lang: 'kan' }` (or similar) in `defineTeam()`.

#### `[testStart]` interpolation in `cleanup:` / `setup:`

`[testStart]` is now a built-in interpolation token that resolves to the ISO
8601 timestamp captured just before the scene's cleanup/setup runs. Use it to
scope cleanup to rows created during the test:

```markdown
cleanup: supabase.from('request_comment').delete().eq('uid', '[friend.key]').gte('created_at', '[testStart]')
```

#### `pressKey` DSL action

New action: `pressKey <key>` sends a raw keyboard event via
`page.keyboard.press()`. Works in both `.spec.md` and TypeScript scenes.

```markdown
learner:

- openTo /review
- see intro-dialog
- pressKey Escape
- see review-page
```

```ts
learner.pressKey('Escape')
```

Accepts any [Playwright key name](https://playwright.dev/docs/api/class-keyboard)
(`Escape`, `Enter`, `Tab`, `ArrowDown`, etc.).

### Bug fixes

#### `if` conditional monitors now fire for already-visible elements

Previously, `if <selector>` only detected elements that appeared _during_ a
concurrent polling window while an action was executing. If the element was
already visible when the action started (e.g. a localStorage-gated intro
dialog), the monitor could miss it.

`executeWithMonitors` now performs a synchronous pre-check of all pending
conditional monitors at the start of every action, before the polling loop
begins. If the selector is already visible, the monitor fires immediately —
the main action does not start until the sub-actions complete.

```markdown
if dismiss-review-intro

- click
- see review-setup-page
```

This now correctly dismisses the overlay even if it is already present when
the `if` line is registered.

### Breaking changes

#### `RegisteredScene.cleanup` type changed from `string` to `string[]`

This affects TypeScript code that directly reads `registered.cleanup`. The
property is now `string[] | undefined` (populated only for markdown scenes).

If you were checking `if (scene.cleanup)` — continue to do so; an empty array
is falsy-equivalent for iteration. If you were reading it as a string, update
to iterate the array.

---

## [0.3.0] — 2026-03-22

Initial public release.

- CLI runner with Playwright
- `scene()` concurrent-actor model and `test()` sequential model
- Inline assertion system (`should()`, `failed()`)
- `.spec.md` markdown scene format
- `cleanup:` pre/post cleanup directives
- `[role.field]` interpolation
- Keyboard actor rotation (accessibility testing)
- Fuzzy-finger touch simulation
- Device rotation
- Swarm mode
- Vite plugin (dev panel injection, production stripping)
- ESLint plugin (`prefer-aria-label` rule)
- VS Code extension (syntax highlighting for `.spec.md`)
