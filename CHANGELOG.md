# Changelog

All notable changes to Scenetest are documented here.

---

## [0.9.0] — 2026-05-05

### New features

#### Interactive analyze app at `/__scenetest/`

The static HTML report file is replaced by an interactive app served by the Vite plugin at `/__scenetest/`. It shows both a log-list view and the existing swim-lane dashboard view, navigable via tabs. The log view is filterable and groupable, with copy-failures support. The app reads live SSE events during a run and picks up past runs from JSON files on disk.

New middleware routes:

- `GET /__scenetest/` — the analyze app
- `GET /__scenetest/runs` — list JSON reports under the configured `reportsDir`
- `GET /__scenetest/runs/:id` — fetch a single report (path-traversal guarded)
- `GET /__scenetest/source` — a window of source lines around a scene's registration point

The app is implemented with Preact + htm via a `<script type="importmap">` pointing at `/__scenetest/vendor/<file>` routes — no build step, no CDN dependency, modules resolved from the plugin's own `node_modules` at runtime.

**CLI report format change:** the CLI now writes JSON only by default. `--format html` prints a note pointing at `/__scenetest/` rather than generating a standalone file. The `reportFormat` config default changes from `'html'` to `'json'`.

Scene source lines are now captured at registration time (`.spec.md` heading line; `.spec.ts` best-effort stack parse) and surfaced in `RegisteredScene.line` / `SceneReport.line` for the source-viewer pane.

#### Terminal-bell sound feedback in CLI

Opt-in audio cues during `scenetest` runs:

- 1 bell when a scene passes
- 2 bells when a scene fails
- 3 bells when the run finishes

Off by default. Enable via `defineConfig`:

```ts
export default defineConfig({
  sound: { enabled: true },
})
```

Or one-off via CLI flags (`--sound` / `--no-sound`) or the `SCENETEST_SOUND` env var (`0`/`1`). Precedence: CLI flag > env var > config. `scenetest init` generates a config with `sound: { enabled: true }` so new projects discover it.

#### `SCENETEST_PANEL` env var

The dev panel can now be toggled without editing `vite.config`:

```bash
SCENETEST_PANEL=0 vite          # disable for this run
SCENETEST_PANEL=1 vite          # force-enable
```

Accepts `0 / false / off / no` (disable) and `1 / true / on / yes` (enable). The explicit `devPanel` plugin option still wins if set.

### API

#### `click` and `ifClick` no longer mutate scope

`click` and `ifClick` were never meant to change scope — but on navigating clicks (the 0.7.2 fix), they did. That's gone. They now leave the scope stack alone in every case; `validateScope()` already handles stale scope after navigation, so the extra reset was just making the rules harder to explain.

If you've been writing `click` followed by `up` to work around this, you don't need to anymore. Paste this into your coding agent:

> Heads up: in `@scenetest/scenes` 0.9.0, `click` and `ifClick` no longer change scope (they weren't supposed to — old versions reset it on navigation as a workaround). If you've been writing `click \n up` in a bunch of places to deal with that, you can stop. Please go over the `.spec.md` files and any TypeScript scenes, look for places where this was happening, and drop the useless `up`s. It's totally fine to keep an `up` if it's actually doing something — just clean up the ones that aren't. Give me a short list of what you changed and what you left alone (and why) when you're done.

### Bug fixes

#### Console error entries show call site before the message

Console errors in CLI output now lead with the source location and function name rather than truncating the message at a fixed character limit mid-line:

```
└─ [actor] /assets/index.js:123:45 in queryFn:
   console.error: ZodError: [...]
```

The `at` frame is parsed to extract the path (origin stripped) and function name. When no stack frame is present, the message is collapsed to one line and truncated with `…`.

---

## [0.8.3] — 2026-04-27

### Bug fixes

#### `up()` and `openTo()` now settle the render queue before continuing

`up()` and `openTo()` only waited for Playwright DOM visibility, so subsequent steps could run while React was still showing a `<Loader />` placeholder for a derived live-query collection that computes in a microtask after the network resolves (TanStack DB-style live queries hit this most often).

A new `settle(page)` helper flushes microtasks + two animation frames, and is called after `up()` waits for visibility and after `openTo()` navigates. Internal change — no API impact, but flaky "saw the loader instead of the content" failures in scenes that mix navigation with derived live queries should clear up.

#### `cleanup:` now runs both before *and* after each scene

`cleanup:` directives were only running before each scene, despite the docs promising `cleanup (before) → setup → scene → cleanup (after)` for idempotency. One scene's leftover state could break the next.

`runCleanup` now takes a `phase` parameter, and both `runner.ts` and `swarm.ts` call it post-scene as well as pre-scene. Log lines distinguish `♻ cleanup ran (before)` / `(after)`.

#### Ambiguous selectors get a dedicated error with `#N` advice

`buildSelectorMissError` previously always wrapped the underlying Playwright failure as "timed out — not visible in current scope", which masked strict-mode violations: when a selector matched multiple elements in scope the user got the wrong diagnostic and no pointer to the `#1`/`#N` escape hatch.

Now matches in scope are counted first. If >1, the error reads:

```
click(submit-button) matched 3 elements in current scope — selector is ambiguous.
  Disambiguate with an Nth-element token: `submit-button #1` (or #2, #3…) to pick a specific match.
```

If exactly 1 match, the root-count hint is omitted (it's a true visibility timeout, not a scoping issue). The existing 0-match path is unchanged.

#### Same-element selector matching covers all attributes, not just `data-key`

The same-element xpath check (used when the selector chain ends on the current element) only looked at `@data-key`, so e.g. `[data-testid="deck-tile"][data-key="kan"]` on the same element wouldn't match unless the final token was the `data-key`. It now uses the same attribute set as `buildTokenSelector` (`aria-label`, `id`, `data-testid`, `data-name`, `data-key`, `name`).

---

## [0.8.2] — 2026-04-23

### Improvements

* For CI workflows, `exit(1)` when there are failures
* Fix llms.txt route
* Navbar stats show _scene_ pass/fail rather than assertions
*

### Site

* Switch to Wrangler for move to CF
* SSR all docs for improved agent readability

## [0.8.1] — 2026-04-17

### API

#### Authoring entry points renamed to match their semantics

We had always intended for the scenetest typescript files to use the semantics of `scene()` and `test()`
for the two different ways to author specs, with `scene` being the scenetest reactive runtime, while `test`
would be for the async/await approach that is a very thin wrapper on the Playwright browser driver.

But along the way something got confused, and we didn't figure it out until we actually started using all
three methods in our project that uses the Scenetest library, so this change actually just brings the API
code into alignment with the way documentation has claimed things worked all along.

**Migration:** rename `flow` → `scene`, and rename any `scene(..., async ({ actor }) => await ...)` call to `test(..., async ({ actor }) => await ...)`. Markdown `.spec.md` files need no changes — they already compile through the reactive path.

### Fixes

#### Remove root-level `pnpm.overrides`

The `devalue`, `nitro>h3`, and `srvx` overrides added in 0.8.0 were breaking the docs site build (TanStack Start + Nitro pulled in an `srvx`/`h3` combination that no longer resolved cleanly once pinned). The overrides are removed; the lockfile now resolves transitive deps naturally. If fresh dependabot alerts appear against `devalue`/`h3`/`srvx` we'll re-evaluate on a per-dep basis rather than pinning wholesale.

---

## [0.8.0] — 2026-04-17

Security-focused maintenance release. Resolves all open dependabot alerts (41 → 0) and adds a runtime nudge for consumers on outdated vite.

### Security

#### Runtime warning for vite versions below the known-patched floor

`@scenetest/vite-plugin` now checks the consumer's resolved vite version at `configResolved` against a per-major "minimum secure" floor and logs a one-time `console.warn` if it falls below it. The peer range stays wide (`^5 || ^6 || ^7 || ^8`) so consumers on older majors can still install, but they'll see:

```
[vite-plugin-scenetest] Heads up: vite@X.Y.Z is below the known-patched floor
for the N.x line (>=N.P.Q). Vite has published security advisories that may
affect your app — run `pnpm audit` (or `npm audit`) for specifics, or see
https://github.com/vitejs/vite/security/advisories
```

Current floors (`MIN_SECURE_VITE_BY_MAJOR` in `packages/vite-plugin/src/index.ts`, last reviewed 2026-04):

| Major | Floor |
|-------|-------|
| 5.x   | 5.4.21 |
| 6.x   | 6.4.2 |
| 7.x   | 7.3.2 |
| 8.x   | 8.0.5 |

Maintenance cadence and review process are documented in `CLAUDE.md` under "Tracking vite security advisories".

#### Dependency upgrades to clear security alerts

- **vitest** `^2.0.0` → `^4.1.4` across all test packages
- **eslint** dev-dep `^9.39.4` in `@scenetest/eslint-plugin`
- **glob** `^10.3.10` → `^11.1.0` in `@scenetest/scenes` (v10 was deprecated; v11 uses `minimatch@^10`)
- **@tanstack/react-router** and **@tanstack/react-start** `^1.156.0` → `^1.167.0` in docs
- **vite** `^5.4.0` → `^6.4.2` in all example apps (`react`, `vue`, `solid`, `svelte`) and in `@scenetest/vite-plugin`'s dev-dep
- **vite** `^7.0.0` → `^7.3.2` in docs (required by TanStack Start + Nitro 3 for `.output/` generation)
- **@sveltejs/vite-plugin-svelte** `^4.0.0` → `^5.0.0` in `example-app-svelte` for vite 6 peer compatibility
- **svelte** `5.49.1` → `5.53.5` (dependabot PR #141)

Remaining transitive vulnerabilities that direct upgrades couldn't reach are resolved via root-level `pnpm.overrides`:

```json
"pnpm": {
  "overrides": {
    "devalue@<5.6.4": "5.7.1",
    "nitro>h3": "2.0.1-rc.20",
    "srvx@<0.11.13": "0.11.15"
  }
}
```

### Improvements

#### Strict selector resolution with diagnostic errors (#144)

`see()`, `click()`, `scope()`, and `ifClick()` no longer fall back to page-root when a scoped locator fails — scope is now strict. Failures produce a diagnostic error naming the action, the selector, and the current scope rather than silently resolving against the wrong subtree. `resolveSelectorWithFallback` has been removed from `selectors.ts`; sequential scope-then-root polling is replaced with progressive resolution within the declared scope.

This is a behavior change for scenes that relied on implicit fallback — if a scoped element can't be found, the test now fails fast with actionable context instead of timing out against the wrong element.

#### Dashboard: follow-output toggle, copy button, line-clamped errors

- **Follow-output toggle** (checked by default): any wheel / touch / scroll-key input turns off auto-scroll so users can inspect a failing test without getting yanked back to the newest scene. Re-checking snaps to the latest.
- **Copy button** next to each scene's Replay: copies scene name, file, status, duration, and failure details to the clipboard.
- **Error line-clamp**: error messages are clamped to 2 lines with click-to-expand.

#### `llms.txt` endpoint output-directory handling

The docs-site `vite-plugin-llms-txt` plugin now writes into the resolved build `outDir` rather than a hardcoded path, so `pnpm build` produces the `llms.txt` / `llms-full.txt` files in the right place for all output modes.

---

## [0.7.3] — 2026-04-11

### Improvements

#### Copy-paste support in HTML test reports

The HTML report generated by `scenetest --report` now includes copy buttons:

- **Copy Full Report** at the top copies the entire report as clean plain text
- **Per-scene Copy** buttons copy individual test results
- Error messages are line-clamped to 3 lines with click-to-expand; copied text always includes the full untruncated error

#### Documentation site URL updated

All references to the old `scenetest.dev` domain have been updated to `scenetest.msnook.xyz`.

### Bug fixes

#### Sequential scope fallback replaces `.or()` race

`resolveSelectorWithFallback` previously raced scoped and page-root locators using Playwright's `.or()`, which broke strict mode when the global selector matched multiple elements. Now the scoped locator is tried first with the full timeout; page-root fallback only runs if the scoped wait fully times out. Out-of-scope resolution is intentionally slow and logs a warning before the root wait.

### Cleanup

- Removed dead mock fields (`_visible`, `isVisible`) from fallback test helpers that were left over from the old `.or()` code path

---

## [0.7.2] — 2026-04-11

### New features

#### `scope()` — explicit scope narrowing

`see()` is now a pure visibility assertion and no longer changes scope. A new `scope()` directive narrows the search context for subsequent actions (`typeInto`, `check`, `select`, bare `click`, etc.):

```markdown
user:
- scope login-form
- typeInto username-input alice@example.com
- typeInto password-input hunter2
- click submit-button
```

`scope()`, `see()`, and `click()` use a fallback resolver — they try the current scope first, then fall back to page root with a warning, so existing tests continue to pass even if they relied on `see()` setting scope. Form interactions (`typeInto`, `check`, `select`) remain strict and only resolve within the current scope to avoid ambiguity across multiple forms on the same page.

#### `llms.txt` / `llms-full.txt` for docs site

The docs site Vite config now includes a plugin that generates `/llms.txt` (structured index with descriptions) and `/llms-full.txt` (all page content concatenated) following the [llmstxt.org](https://llmstxt.org) convention. Since the docs site is a React SPA, LLMs fetching pages would only get the JavaScript shell — these static text files give them the actual content.

### Bug fixes

#### `scope()` waits for visibility before resolving

`scope()`, `see()`, and `click()` used a point-in-time `count()` check to decide whether to resolve within the current scope or fall back to page root. If the target element hadn't appeared yet, `count()` returned 0 for both locators, causing the fallback to pick the wrong subtree and subsequent `waitFor` to time out.

Now `resolveSelectorWithFallback` waits for the scoped locator first (full timeout), then falls back to page root only if the scoped wait fully times out. This sequential approach replaces the previous `locator.or()` race which broke Playwright's strict mode — racing both locators meant Playwright saw every match on the page, not just the scoped one. The tradeoff: out-of-scope resolution is intentionally slow, paying the full timeout before fallback. `ifClick()` retains the instant `count()` path since it needs non-blocking behavior.

#### Scope reset after click-induced navigation

`click()` and `ifClick()` now detect URL changes and reset scope to page root when navigation occurs, matching the existing behaviour of `openTo`, `goBack`, etc. `seeToast()` always resolves from page root since toasts render as portals outside any scoped container.

This fixes tests where `see()` timed out searching within a stale scope after a click navigated to a new route.

> **Note (0.9.0):** the click/navigation reset described here was removed in 0.9.0. `click` and `ifClick` now never change scope; `validateScope()` handles stale-scope cleanup. See the 0.9.0 entry for the migration prompt.

### Migration

#### `see` → `scope` codemod

A codemod is available to update `.spec.md` files that used `see` for scope narrowing:

```bash
node scripts/codemod-see-to-scope.mjs          # dry-run
node scripts/codemod-see-to-scope.mjs --write   # apply
```

The script converts `see` → `scope` where `see` is followed by scope-dependent actions (`typeInto`, `check`, `select`, bare `click`, `prev`, etc.). Pure visibility assertions are left untouched.

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

### Improvements

#### `[role.field]` interpolation works for any team member

Previously, referencing `[learner2.key]` in a `.spec.md` step required declaring an empty `learner2:` block in the scene just to bring the credentials into scope. Now interpolation falls back to the full team config, so any team member's fields are available without declaring them as actors. This applies to both `.spec.md` scenes and the TypeScript `flow()` API.

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
