# Changelog

All notable changes to Scenetest are documented here.

---

## 2026-06-22 — monorepo 0.17.0 · @scenetest/scenes 0.16.0, @scenetest/vite-plugin 0.17.0, @scenetest/dashboard 0.14.0, @scenetest/protocol 0.12.0, @scenetest/receiver 0.12.0

**Dashboard control plane.** The dashboard can pause/resume/stop a run and re-run a team. Directions reach the CLI the same way in dev and cloud (receiver → `onCommand` → the run) and their effects come back as events. Commands target the active run; the only protocol change is two events plus a flag.

### @scenetest/protocol 0.12.0
* `run:paused` / `run:resumed` events, and an optional `cancelled` flag on `run:end` (set when a run is stopped; the summary still reflects what ran). Additive; `PROTOCOL_VERSION` unchanged.

### @scenetest/scenes 0.16.0
* `--command-file` (and `SCENETEST_COMMAND_FILE`) tails a JSONL file for inbound commands: pause/resume park/release at scene boundaries; stop ends cooperatively, emitting the final `run:end` (partial summary + `cancelled`) so it's never lost; replay relaunches.
* New `RunController`, `watchCommandFile()`, `SceneRunner.attachController()`, and a `teams --json` subcommand.

### @scenetest/vite-plugin 0.17.0
* Dashboard pause/resume/stop now work — routed to the CLI via `--command-file` (matching cloud), replacing the old `SIGSTOP`-the-shell that never reached the process. Adds `GET /__scenetest/teams` and the unified `POST /__scenetest/commands`. No consumer-API change.

### @scenetest/receiver 0.12.0
* `createReceiverApp({ sinks, onCommand? })` + `POST /commands` — decode a `Command`, hand it to `onCommand` (`runId` is metadata, never the address). Always 200. New `CommandHandler`/`CommandMeta`.

### @scenetest/dashboard 0.14.0
* Pause/Resume toggle and a "stopped" marker driven by the new events/flag; the replay team picker lists configured teams from `GET /__scenetest/teams` instead of only those seen in events.

---

## 2026-06-22 — monorepo 0.16.1 · @scenetest/checks 0.13.1

### @scenetest/checks 0.13.1

**Fix the observer panel's "dashboard" button + add a demo mode.** The button linked to `/__scenetest/dashboard`, a path that stopped existing when the dashboard's views were renamed — the live dashboard (Home) now mounts at the base `/__scenetest`, with `/__scenetest/runner` and `/__scenetest/waterfall` for the other views. The button now points at `/__scenetest`, so under a dev server it opens the live dashboard again instead of 404'ing. (Reference docs that pointed at the old URL are corrected too.)

For standalone hosts with no dev server behind them (the docs site), set `window.__scenetest_demo = true` and the "dashboard" button pops the fullscreen assertion viewer — the same window an assertion click opens — instead of following the dead link. The flag is read at click time, so it can be set any time after the panel mounts.

---

## 2026-06-18 — monorepo 0.16.0 · @scenetest/dashboard 0.13.0, @scenetest/vite-plugin 0.16.0

**Embedded routing fix.** `<Dashboard>` no longer runs its own router against a hardcoded `/__scenetest` base — it defers to the host's `preact-iso` router, so it embeds correctly inside another app (scenetest-cloud, mounted per-PR at `/repo/:owner/:name/pr/:number`) without rewriting the browser URL. `@scenetest/dashboard` (breaking) bumps to 0.13.0 and `@scenetest/vite-plugin` (which bundles the dev dashboard) to 0.16.0; other packages are unchanged.

### @scenetest/dashboard 0.13.0

* **Breaking — routing is owned by the host's `preact-iso` `LocationProvider`.** The dashboard mounts on a single route with an optional trailing param, `{base}/:view?`, which matches the base *and* each view in one pattern; it reads the matched view from `useRoute().params.view` and never touches `history`/`location` itself. This replaces the old hardcoded `/__scenetest` routing + in-widget `pushState`, which rewrote the host's URL when the dashboard was embedded (tab clicks lied; reload / deep-link 404'd). `preact-iso` is now a runtime dependency.
* **`basePath` is now required**, and only builds the absolute, deep-linkable tab hrefs (view selection is the route param). `apiBase` (default `basePath`) bases the Runner's server-endpoint fetches, decoupled because an embedding host's API may live elsewhere than its router. The old internal `BASE` constant and the unreleased `viewForPath` / `viewHref` helpers are gone.
* **New `BrowserDashboard` export** — the standalone entry point that supplies the one `LocationProvider` + `Router` a top-level app must own: `render(<BrowserDashboard transport={…} />)`. An app that already owns a `LocationProvider` (cloud) renders the bare `<Dashboard basePath={…} />` under its own `:view?` route instead.
* **Stable mount across views.** Because every view matches the one route, `<Dashboard>` stays mounted when you switch tabs, so the TanStack DB read model and the event stream are built once and survive navigation — no reconnect, re-fold, or lost filter state.

### @scenetest/vite-plugin 0.16.0

* **Dev dashboard shell renders `BrowserDashboard`** and ships the rebuilt dashboard with host-owned routing. No change to the plugin's consumer API (`strip` / `devPanel` / `demo` / `csp`).

---

## 2026-06-15 — @scenetest/dashboard 0.12.0, @scenetest/vite-plugin 0.15.0

**Dashboard modernization.** `@scenetest/dashboard` becomes a plain, embeddable Preact component over the TanStack DB read model — light-DOM, reactive, with the latest-run slice maintained by the database rather than re-folded in JS. `@scenetest/dashboard` (breaking) bumps to 0.12.0 and `@scenetest/vite-plugin` (which bundles the dev dashboard) to 0.15.0; other packages are unchanged. (Versions are now per-package semver, not a shared release number.)

### @scenetest/dashboard 0.12.0

* **Breaking — component-only API.** The package now exports the `<Dashboard>` Preact component; render it directly (`render(<Dashboard transport={…} />, el)`). Removed `mountDashboard()` (both hosts are Preact), `Transport.fetchState()` (history flows through the `subscribe` replay in both transports), the `<Dashboard base>` prop (the mount path is a single internal constant), and the dead `initialState()` export.
* **Light-DOM app + shipped stylesheet.** No shadow root anymore — the dashboard renders into the light DOM under a `.scenetest-dashboard` root, and its CSS ships as a stylesheet the host imports (`import '@scenetest/dashboard/style.css'`, a new `./style.css` export). The observer panel in `@scenetest/checks/panel` keeps its own shadow root; the dashboard does not.
* **TSX views, reactive reads, real navigation.** Views migrated from htm to TSX/JSX and read the read model reactively via a `useLiveQuery` hook (no hand-rolled `subscribeChanges`); navigation is real `<a>` links with client-side routing, and the timeline view moved to the `/__scenetest/waterfall` route.
* **Latest-run slice maintained in the DB.** The live views' `where runId = latest` slice (scenes/actions ordered by start time) is now a `createLiveQueryCollection` derived collection, maintained incrementally, instead of re-scanning every run's rows in JS each render.
* **Performance.** `useLiveQuery` returns a stable array identity between changes, so downstream `useMemo`s actually hit; assertions/actions are attributed to scenes in one pass instead of a per-scene re-filter.

### @scenetest/vite-plugin 0.15.0

* **Dev dashboard rebuilt as a real Vite app.** The `/__scenetest` shell now renders the `<Dashboard>` component (bundling `@tanstack/db` and Preact natively — no hand-rolled esbuild, importmap, or vendored-module routes), serves the dashboard's `style.css`, and serves the Home/Runner/Waterfall views as static files, including the new `/__scenetest/waterfall` route. No change to the plugin's consumer API (`strip` / `devPanel` / `demo` / `csp`).

---

## [0.15.0] — 2026-06-12

**`@scenetest/scenes` gains a pluggable report destination.** The CLI can now stream its protocol events to any HTTP endpoint as a run executes — the "speaking" half of the receiver/sink design — unblocking direct-to-cloud and bring-your-own-runner CI reporting. Only `@scenetest/scenes` bumps (to 0.15.0); other packages are unchanged.

### @scenetest/scenes

* **New `--report-url <url>` flag (and `SCENETEST_REPORT_URL` env var)** — streams protocol events to a caller-supplied HTTP endpoint as the run executes, the "speaking" half of the receiver/sink design. `POST`s batched `{ "events": [{ "seq", "payload" }] }` (protocol events verbatim; `seq` is monotonic per run), flushing every ~250ms or 50 events with a final flush before exit. Fail-soft (an unreachable endpoint warns once and never fails the run) and additive — the dev middleware / `.jsonl` keep working. Optional `SCENETEST_REPORT_TOKEN` is sent as an `Authorization: Bearer` header. New config fields `reportUrl` / `reportToken` mirror the flag and env vars.
* **Fix: `scenetest --version` now reports the installed package version** instead of a stale hardcoded `0.7.0`. The version is read from `package.json` at runtime, so it no longer drifts between releases.

---

## [0.14.0] — 2026-06-11

**The recorder panel moves to `@scenetest/scenes/recorder`**, completing what 0.13.0 did for the observer: each panel lives with the package it's a lens/composer for. The recorder composes scenes DSL, so it versions in lockstep with the parser that consumes its output — and like the observer it is pure DOM code with zero Vite coupling (record on any page, export `.spec.md`, run with the CLI). `@scenetest/scenes` and `@scenetest/vite-plugin` bump to 0.14.0; other packages are unchanged.

### @scenetest/scenes

* **New subpath `@scenetest/scenes/recorder`** — the scene recorder panel, auto-initializing on import.

### @scenetest/vite-plugin

* **Breaking: the `./panels/recorder` subpath is removed** — the plugin now injects the recorder from `@scenetest/scenes`, which becomes an **optional peer dependency**. `recorder: true` requires `@scenetest/scenes` to be installed — which every scenetest app already has, since it's the test runner. If you imported `@scenetest/vite-plugin/panels/recorder` directly, import `@scenetest/scenes/recorder` instead.
* Internal: removed a directory of unreferenced legacy icons.

### Migration

If you are coming from `@scenetest/scenes-panel` (≤0.11.0), the target is `@scenetest/scenes/recorder` — not the short-lived intermediate paths. One-liner for your AI assistant:

```text
Replace any dependency on @scenetest/scenes-panel with @scenetest/scenes
(^0.14.0), and rewrite imports of '@scenetest/scenes-panel/auto',
'@scenetest/scenes-panel', or '@scenetest/vite-plugin/panels/recorder' to
'@scenetest/scenes/recorder'. Pure rename; no API or behavior changes.
```

## [0.13.0] — 2026-06-11

**The observer panel moves to `@scenetest/checks/panel`.** The panel is the viewing lens for checks' assertions — dependency-free DOM code that hooks `window.__scenetest_report` — and is usable with any bundler and no Vite at all, so it belongs with the assertions, not the Vite plugin. `@scenetest/checks` and `@scenetest/vite-plugin` bump to 0.13.0; other packages are unchanged.

### @scenetest/checks

* **New subpath `@scenetest/checks/panel`** — the floating observer panel, auto-initializing on import. Works under any bundler with no scenetest Vite plugin; the plugin-served niceties (click-to-editor via `/__open-in-editor`, the dashboard link) degrade gracefully when absent.

### @scenetest/vite-plugin

* **Breaking: the `./panels/observer` subpath (introduced in 0.12.0) is removed** — the plugin now injects the panel from its `@scenetest/checks` dependency. If you imported `@scenetest/vite-plugin/panels/observer` directly, import `@scenetest/checks/panel` instead; if you only used the panel through dev injection, nothing changes. `./panels/recorder` stays where it is.

### Migration

If you are coming from `@scenetest/checks-panel` (≤0.11.0), the target is `@scenetest/checks/panel` — not the short-lived 0.12.0 path. One-liner for your AI assistant:

```text
Replace any dependency on @scenetest/checks-panel with @scenetest/checks
(^0.13.0), and rewrite imports of '@scenetest/checks-panel/auto',
'@scenetest/checks-panel', or '@scenetest/vite-plugin/panels/observer' to
'@scenetest/checks/panel'. Pure rename; no API or behavior changes.
```

## [0.12.0] — 2026-06-11

**Package consolidation.** Six packages folded into two existing ones — npm package names and import paths change, but every API keeps its name and signature. No behavior changes. `@scenetest/checks` and `@scenetest/vite-plugin` bump to 0.12.0 (and `@scenetest/eslint-plugin` from 0.10.0 to 0.12.0); unchanged packages — `@scenetest/scenes`, `@scenetest/protocol`, `@scenetest/receiver`, `@scenetest/dashboard` — stay at 0.11.0.

### @scenetest/checks

* **Breaking: the framework binding packages are gone; bindings are now subpath exports of `@scenetest/checks`.** `@scenetest/checks-react`, `@scenetest/checks-vue`, `@scenetest/checks-solid`, and `@scenetest/checks-svelte` are no longer published. Import the same APIs from `@scenetest/checks/react`, `@scenetest/checks/vue`, `@scenetest/checks/solid`, or `@scenetest/checks/svelte` instead. Each subpath still re-exports the full core API (`should`, `failed`, `serverCheck`, `match`, `defineConfig`), so it stays a one-import experience. The framework dependencies (`react`, `vue`, `solid-js`, `svelte`) are optional peer dependencies — you only need the one you import.

### @scenetest/vite-plugin

* **Breaking: `@scenetest/checks-panel` and `@scenetest/scenes-panel` are gone; the panel UIs now ship inside the plugin.** The observer panel is `@scenetest/vite-plugin/panels/observer` and the recorder panel is `@scenetest/vite-plugin/panels/recorder` (both auto-initialize on import, like the old `/auto` entries). If you only ever used the panels through the plugin's dev injection — the normal case — nothing changes and there is nothing to do.
* The production strip now matches `@scenetest/checks` subpath imports (`/react`, `/vue`, `/solid`, `/svelte`, `/runtime`). The old standalone binding package names remain in the strip list, so apps that haven't migrated keep stripping cleanly.
* Internal: panel injection now resolves via a self-referencing subpath export, which removes the pnpm-strict-hoisting edge case for panel resolution entirely.

### @scenetest/eslint-plugin

* `inline-server-fn` recognizes `serverCheck` imported from the new `@scenetest/checks/*` subpaths (old package names still recognized).

### Migration

The old packages stay on npm at 0.11.0 (and will be marked deprecated) but receive no further updates. To migrate, paste the block below into your AI coding assistant — or apply it by hand; it is a pure rename:

```text
Migrate this repo from scenetest's standalone binding packages to the
consolidated 0.12 layout. These are pure renames — no API, signature, or
behavior changes.

1. In package.json (all workspaces):
   - Replace any dependency on @scenetest/checks-react, @scenetest/checks-vue,
     @scenetest/checks-solid, or @scenetest/checks-svelte with
     @scenetest/checks (same version range, ^0.12.0 or later).
   - Replace any dependency on @scenetest/checks-panel or
     @scenetest/scenes-panel with @scenetest/vite-plugin (^0.12.0 or later).
   - Bump @scenetest/checks and @scenetest/vite-plugin to ^0.12.0. Leave
     @scenetest/scenes at its current 0.11.x range — it did not change in
     this release.

2. In source files, rewrite import specifiers (named imports are unchanged):
   - '@scenetest/checks-react'  -> '@scenetest/checks/react'
   - '@scenetest/checks-vue'    -> '@scenetest/checks/vue'
   - '@scenetest/checks-solid'  -> '@scenetest/checks/solid'
   - '@scenetest/checks-svelte' -> '@scenetest/checks/svelte'
   - '@scenetest/checks-panel/auto'  -> '@scenetest/vite-plugin/panels/observer'
   - '@scenetest/checks-panel'       -> '@scenetest/vite-plugin/panels/observer'
   - '@scenetest/scenes-panel/auto'  -> '@scenetest/vite-plugin/panels/recorder'
   - '@scenetest/scenes-panel'       -> '@scenetest/vite-plugin/panels/recorder'
   Also update any of these names appearing in declare-module blocks (*.d.ts),
   vite/vitest config (optimizeDeps, ssr.noExternal, aliases), and docs.

3. Run the package manager install to refresh the lockfile, then build and
   typecheck. Imports of useCheck, watchCheck, createCheck, checkEffect,
   should, failed, serverCheck, match, and defineConfig all keep their names.
```

## [0.11.0] — 2026-06-11

Coordinated release: all packages changed since 0.10.0 (`checks`, `protocol`, `scenes`, `vite-plugin`, and the new `receiver` and `dashboard`) ship as 0.11.0.

### @scenetest/dashboard (new)

* **New package: `@scenetest/dashboard`** — the dashboard UI extracted from the Vite plugin's inline HTML string into a mountable Preact widget. `mountDashboard(element, { transport, theme? })` renders into a shadow root (own styles/fonts, no leakage in either direction) so dev and scenetest-cloud mount the same widget; the only dev/cloud difference is the `Transport` adapter (`fetchState` / `subscribe` / `sendCommand` over `@scenetest/protocol` types). Ships `createDevTransport()` (fetch + SSE against the Vite middleware) and a DOM-free event-folding store (`foldEvents`, `applyEvent`). Theming is limited to `--st-bg` / `--st-accent` / `--st-font` / `--st-font-size`.
* `@scenetest/protocol` now also exposes `./package.json` in its exports map (so tooling can resolve it under CJS) — additive, non-breaking.

### @scenetest/vite-plugin

* **The `/__scenetest/dashboard` page is now a thin shell that mounts `@scenetest/dashboard`.** The ~1200-line inline dashboard HTML/JS moved into the widget package; the page serves an importmap + bootstrap and the widget's built ESM is served off disk under `/__scenetest/widget/*`. The live dev dashboard is unchanged for users. **Breaking for direct importers of the `./dashboard` subpath:** `generateDashboardHtml()` now returns this dev shell (which depends on the Vite middleware's widget routes), not a self-contained page — consumers rendering their own dashboard should migrate to `mountDashboard()` from `@scenetest/dashboard` with their own transport.

### @scenetest/receiver (new)

* **New package: `@scenetest/receiver`** — the receiver core extracted from the Vite middleware as a framework-agnostic Hono app. `createReceiverApp({ sinks })` accepts protocol events on `POST /events` (envelope-validated with `isEventShaped()` so it relays event types newer than itself, always responding 200 so old CLIs never break) and fans them out to `Sink`s, calling `clear()` on `run:start`. Ships a `JsonlSink` (one protocol event per JSON line) and a `toNodeHandler()` adapter; the Vite middleware now delegates `POST /__scenetest/events` to it with the SSE `EventHub` as a sink, and dev behavior is unchanged.

### @scenetest/vite-plugin

* **Hardened the `serverCheck()` executor.** Each server function now runs under a per-check timeout (default 5000ms, configurable via the new `serverCheckTimeout` plugin option) and receives an `AbortSignal` as a new `signal` helper (`{ should, failed, signal }`); a hung check is reported as a failed assertion and the RPC response always returns.
* Middleware-level failures on `POST /__scenetest/run` (virtual-module load error, unknown serverFn id, scenetest config load error) now answer HTTP 200 with a normalized failed check — title-prefixed description, error detail in `context` — instead of an opaque 500 or an empty `success: false` response.
* serverFns and the scenetest config are loaded through Vite's Environments API module runner (`createServerModuleRunner` against the `ssr` environment) when available, falling back to `server.ssrLoadModule` on vite 5.
* The SSE stream now flushes its response headers on connect, so a dashboard `EventSource` opened before any run fires `open` immediately instead of waiting for the first event.

### Security

* **Typed values no longer leave the test process.** `typeInto()` and `select()` used to record their target as `selector=value`, which put the literal value — including `[self.password]` from the builtin login macro — into dashboard events (SSE-visible to anything that could reach the dev server) and into the persisted run-report timeline. The target is now the selector only, in both the `test()` and `scene()` models.
* The `/__scenetest/events` SSE stream no longer sends `Access-Control-Allow-Origin: *`. Its only legitimate browser consumers are the same-origin dashboard pages; cross-origin pages could previously read the full buffered event stream.

## @scenetest/protocol 0.10.0 — 2026-06-11

* **New package: `@scenetest/protocol`** — the typed event and command vocabulary shared by the CLI, Vite plugin, dashboard, and the cloud service (architecture step 1 of the scenetest-cloud plan). Defines the `RunEvent` union (the existing `run:start` … `run:end` wire format, unchanged, plus a new `run:progress` rollup event for home-view tiles), the `Command` union (`run:replay`, `run:stop`, `run:pause`, `run:resume`), and a zero-dependency codec: strict `decodeEvent()`/`decodeCommand()` that never throw, and `isEventShaped()` for relays that must pass through event types newer than themselves. `@scenetest/scenes` now sources `TeamMeta`, `RunSummary`, and `DashboardEvent` (a back-compat alias of `RunEvent`) from it, and the Vite middleware validates inbound CLI events with it. No wire-format or behavior changes.

## @scenetest/vite-plugin 0.10.1 — 2026-06-11

* Expose `./dashboard` in the package `exports` map. `dist/dashboard.js` and its types were already shipped but couldn't be imported under `moduleResolution: Bundler` or esbuild. External consumers (e.g. scenetest-cloud's Worker-rendered per-run dashboard) can now `import { generateDashboardHtml } from '@scenetest/vite-plugin/dashboard'` without a `pnpm.patchedDependencies` patch. Note: this subpath is a stopgap — the planned dashboard widget extraction (`mountDashboard` + transport adapters in a dedicated package) will supersede it.

## [0.10.0] — 2026-06-05

### New

* **Teams everywhere.** Each scene now shows which team ran it — in the CLI output, the live dashboard, and reports. A new `--team <name>` flag (and a dashboard dropdown) lets you run or replay just one team.
* **Clearer failures.** Failed scenes are set off with blank lines and a separator so they're easy to find and copy out of CI logs. Each failure now points at the exact source line that broke, with a couple of lines of surrounding code. The summary also lists scene counts per team.
* **`/__scenetest/` landing page.** Visiting `/__scenetest/` now shows an index page; the test runner moved to `/__scenetest/runner`.
* **Friendlier `should()` / `failed()`.** Both now accept a function for the condition (and `failed()` a lazy context), so you can compute values on the spot. Ships with a new inline-assertions Agent Skill that teaches the patterns.
* **New ESLint rule `inline-server-fn`** — flags when a `serverCheck()` server function isn't written inline (the plugin can't extract it otherwise).

### Fixes

* `serverCheck()` extracted functions are now emitted as async.
* Stripping a check call written without braces (e.g. `if (x) should(...)`) no longer drops the surrounding code.

## [0.9.2] — 2026-05-06

* Fix bug with multiple panels showing

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
