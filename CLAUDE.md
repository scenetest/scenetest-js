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
packages/                   # Published packages
├── checks/                 # Core library — should(), failed(), serverCheck(), match(); framework bindings as subpath exports (./react, ./preact, ./vue, ./solid, ./svelte) with optional peer deps; observer panel UI as ./panel (vite-free, works under any bundler)
├── protocol/               # Wire protocol — typed event/command vocabulary + codec shared by CLI, plugin, dashboard, cloud
├── receiver/               # Receiver core — framework-agnostic Hono app that accepts protocol events and fans them out to sinks
├── dashboard/              # Mountable Preact dashboard widget — mountDashboard() + transport adapter, shared by dev and cloud
├── scenes/                 # CLI runner — scene(), test(), actor DSL, selectors, teams, config; recorder panel UI as ./recorder subpath (vite-free DOM code, versions in lockstep with the DSL it emits)
├── vite-plugin/            # Vite plugin — dev panel injection, prod stripping, RPC middleware; injects the observer from @scenetest/checks/panel and the recorder from @scenetest/scenes/recorder (optional peer)
├── eslint-plugin/          # ESLint plugin — prefer-aria-label, inline-server-fn rules
└── vscode-scenetest/       # VS Code extension — syntax highlighting for .spec.md scene specs

examples/                   # Private workspace apps (never published) — the dev loop, e2e harness, and per-framework compile-tests for the consumer API
├── react/                  # React demo app (package name example-app-react) — root `pnpm dev` and the Playwright e2e suite boot this one; has working Scene tests
├── preact/                 # Preact demo app (example-app-preact)
├── vue/                    # Vue demo app (example-app-vue)
├── solid/                  # Solid demo app (example-app-solid)
└── svelte/                 # Svelte 5 demo app (example-app-svelte)
```

---

## Writing Tests with Scenetest

**For writing scene specs and inline assertions, see [`docs/public/design/writing-tests.md`](docs/public/design/writing-tests.md).** That guide covers both authoring models (`scene()` concurrent and `test()` classic driver), the actor DSL, and links to canonical references for selectors, text DSL format, and execution models. It is designed to be self-contained — copy it into your application repo's CLAUDE.md or reference it directly.

---

## Key Source Files

### Checks (`packages/checks/src/`)
- `assertions.ts` — `should()`, `failed()`, `serverCheck()` (stub), `match()`
- `runtime.ts` — `__scenetest_rpc()` client for multi-context assertions
- `types.ts` — `AssertionResult`, `ServerContext`, RPC types, `ScenetestReporter` + the `window.__scenetest_report` global declaration
- `index.ts` — public exports
- `react.ts` / `preact.ts` / `vue.ts` / `solid.ts` / `svelte.ts` — framework bindings (`useCheck` for react and preact, `watchCheck`, `createCheck`, `checkEffect`), published as subpath exports with optional peer deps; each re-exports the core API so app code imports from one place
- `panel/` — the floating observer panel (panel, fullscreen viewer, history, audio), subpath export `./panel`, auto-initializing on import. Dependency-free DOM code hooking `window.__scenetest_report` — works under any bundler with no Vite; the Vite plugin injects it in dev, and the docs site imports it directly
- `skills/inline-assertions/SKILL.md` — shippable Agent Skill (TanStack Intent) teaching `should()`/`failed()`/`serverCheck()` authoring. Shipped in the npm tarball (`files` includes `skills`, `tanstack-intent` keyword). Validate with `pnpm -C packages/checks skills:validate`. Consumers discover it via `npx @tanstack/intent list` and load `@scenetest/checks#inline-assertions`. Keep it in sync with `docs/public/guides/writing-inline-assertions.md`.

### Protocol (`packages/protocol/src/`)
- `events.ts` — `RunEvent` union (`run:start` … `run:end`, plus the `run:progress` rollup), `TeamMeta`, `RunSummary`, `PROTOCOL_VERSION`. Every event carries a required `runId` (the `run:start` timestamp; producers stamp it via `dashboardSend`) so consumers partition a PR's whole history by run and attach mid-stream without inferring run from order — required in the strict shape/codec like `name`/`file`, but not in the lenient `isEventShaped` relay envelope
- `commands.ts` — `Command` union (`run:replay`, `run:stop`, `run:pause`, `run:resume`)
- `codec.ts` — `encodeEvent()`/`decodeEvent()` (strict, never throws), `isEventShaped()` (envelope-only check so relays pass through event types newer than themselves)

Zero-dependency package; the seam between the dev tool and scenetest-cloud. Producers (CLI, injected listener) and consumers (dashboard, recorders, cloud worker) share this vocabulary, and wire-format changes route through a published release so version skew stays visible. `@scenetest/scenes` re-exports `RunEvent` as `DashboardEvent` for backwards compatibility.

### Receiver (`packages/receiver/src/`)
- `app.ts` — `createReceiverApp({ sinks })`, a Hono app with `POST /events` (envelope-validated via `isEventShaped()`, always responds 200, calls sink `clear?.()` on `run:start`), `ReceiverAppType` for `hono/client`
- `sink.ts` — `Sink` interface (`write()`, optional `clear()`), `JsonlSink` (one protocol event per JSON line, lazy open, `close()`)
- `node.ts` — `toNodeHandler(app)` via `@hono/node-server`'s `getRequestListener`, for mounting in connect-style servers (Vite dev server)

The receiver core extracted from the Vite middleware, framework-agnostic so scenetest-cloud can mount the same app. It is a relay: envelope-only validation passes through event types newer than itself, and responses are always `200` (`{"ok":true}`/`{"ok":false}`) because the CLI's reporter is fire-and-forget. The Vite middleware delegates `POST /__scenetest/events` to it with the SSE `EventHub` as a sink; serving SSE itself stays in the middleware (dev-transport concern). Only this package depends on `hono`/`@hono/node-server`.

### Dashboard (`packages/dashboard/src/`)

**Nomenclature:** the **Dashboard** is the *entire* Preact app and all its views — **Home**, **Runner**, **Waterfall**. (There is no "Console" — that name is retired.) Every view reads from one read-only `@tanstack/db` read model (the collections); there is no bespoke fold anymore.

- `dashboard.ts` — `mountDashboard(element, { transport, theme?, base? })`: the whole app. Owns a shadow root + namespaced `dashboard-styles.ts`, routes on `location.pathname` (`/__scenetest` Home · `/__scenetest/runner` Runner · `/__scenetest/dashboard` Waterfall). **`useDashboardRows(transport)` builds the four collections** (`scenesProjection`/`assertionsProjection`/`actionsProjection`/`runsProjection` via `createCollection` + `runCollectionOptions`, sharing one `createRunSource`) and reads them reactively (`subscribeChanges` → re-render); every view gets the rows. The Waterfall view (`WaterfallHost`) renders into a **nested** shadow root (style-isolated from the chrome) but its data is the same store. Dev + cloud mount this same app; only the transport differs. Replaced `vite-plugin/src/analyze-app.ts` (deleted).
- `runner.ts` — the Runner view (htm): `RunnerView` + `Tree`/`ListPane`/`Detail`/`SpecSnippet`/`CopyButton`. Live = `selectSnapshot(rows)`; past runs map a `/__scenetest/runs/:id` report.
- `runner-store.ts` — Runner selectors: `selectSnapshot(scenes, assertions, actions, runs)` derives per-scene assertions/timeline from the collection rows via `attributeToScene`; `mapReportToSnapshot()` adapts a past-run JSON report into the same shape.
- `app.ts` — `Waterfall` view component (htm) `{ state, send }` + `Header`/`SceneCard` + `sceneSummary()`. A pure view — the root passes `state` (from `selectWaterfall`).
- `store.ts` — `selectWaterfall(scenes, assertions, actions, runs)`: derives the Waterfall's `DashboardState` (lanes by actor, attributed assertions, run rollup) from the collection rows. (Replaced the old `applyEvent` event-fold.) + `completedSceneCount`, `initialState`.
- `select-helpers.ts` — `latestRunSlice(...)` (the multi-run store sliced to `where runId = latest`, shared by both selectors) + the `DashboardRows` type.
- `dev-transport.ts` — `createDevTransport()`: fetch + SSE adapter; maps `Command`s to `/__scenetest/replay|stop|pause`
- `types.ts` — `Transport`, `DashboardState`, `Scene`, `DashboardTheme`, `ConnectionStatus`, `MountOptions`
- `styles.ts` — Waterfall widget shadow-root CSS (nested root); `dashboard-styles.ts` — dashboard chrome/Runner/Home CSS. Theming surface is `--st-bg`/`--st-accent`/`--st-font`/`--st-font-size` only
- `collections/` — the read-only TanStack DB read model over the run stream, subpath export `./collections`, and now **the store the whole dashboard reads from** (dev and cloud). **Multi-run:** rows are partitioned by `runId`, spanning a whole PR's history; a new `run:start` opens a new partition and does **not** truncate. `createRunSource(transport)` wraps the transport as one shared fan-out stream; `runCollectionOptions({ source, projection })` returns a `CollectionConfig` for `createCollection`. Many collections share one source = one connection, many tables. Projections (`scenesProjection`, `assertionsProjection`, `actionsProjection`, `runsProjection`) are the sole writers, folding `RunEvent`s into a tiny `RowOp` vocabulary (`insert`/`update`/`delete`/`reset`), testable without TanStack DB; client mutations throw. `attributeToScene` joins assertions/actions to scenes: stamped scene id when present, else actor + time-window (#215 / 2a). **`@tanstack/db` is a runtime `dependency`** (the dashboard uses `createCollection` at runtime). The `./collections` subpath itself still only `import type`s `CollectionConfig`, so a cloud consumer may build collections with its *own* `@tanstack/db` instance (single instance for joins with their `useLiveQuery`). See `docs/public/design/unified-console.md`.

The dashboard UI was extracted from the Vite plugin's inline HTML string so dev and scenetest-cloud mount the same app; the dev/cloud difference is confined to the transport adapter (dev: fetch+SSE; cloud: fetch+WebSocket). The dev shell is a **real Vite app** — `packages/vite-plugin/app/` (a ~10-line shell: `mountDashboard(root, { transport: createDevTransport() })`) — built by the plugin's `build` (`tsc && vite build -c app/vite.config.ts`) to `packages/vite-plugin/dist-app/` and served as **static files** at all view routes by the middleware. Because the shell is a normal Vite build, `@tanstack/db` bundles natively — no hand-rolled esbuild, importmap, or vendored-module routes (all deleted, along with `analyze-app.ts`). Same shell scenetest-cloud wraps with a different transport. The remaining unified-console work is the cloud transport + the PR-history report loader (design phases 2 & 4).

### Scenes (`packages/scenes/src/`)
- `scene.ts` — `test()` registration (await-driven), shared `registerScene()` helper, `runScene()`, session accessors
- `actor.ts` — `SequentialActorHandleImpl` with all DSL methods, `ActionChainImpl` with scope tracking (await-driven `test()` model)
- `reactive.ts` — `ConcurrentActorHandleImpl`, `drainAll()`, `scene()` registration (reactive queue-building model)
- `selectors.ts` — `resolveSelector()`, `explainSelector()`, alias registry
- `dsl.ts` — `runDsl()`, `defineMacro()`, `runMacro()`, text DSL parser
- `message-bus.ts` — `MessageBus` with sticky messages
- `team-manager.ts` — `TeamManager` with pool acquire/release for parallel execution
- `runner.ts` — `SceneRunner` with scene discovery, browser init, lifecycle hooks
- `cli.ts` — CLI entry point, report generation (HTML/JSON)
- `keyboard.ts` — `NavigationModeRotation`, `tabToElement()`, `pressEnter()`, `clearAndType()`, fuzzy-finger helpers (`fuzzyFingerClick`, `fuzzyFingerFill`, `fuzzyFingerCheck`), `FuzzyFingerError`
- `config.ts` — `loadConfig()`, `findConfigFile()`, `defineConfig()`, team discovery
- `types.ts` — All type definitions (`ScenetestConfig`, `SequentialActorHandle`, `ActionChain`, `ConcurrentActorHandle`, `SceneContext`, etc.)
- `recorder/` — the scene recorder panel (capture, reverse-selector, panel UI), subpath export `./recorder`, auto-initializing on import. Pure DOM code with no Vite coupling; the Vite plugin injects it when `recorder: true`

### Vite Plugin (`packages/vite-plugin/src/`)
- `index.ts` — Main plugin (dev: inject observer + middleware; prod: strip)
- `strip.ts` — AST-based removal of scenetest imports and calls
- `transform.ts` — Extract `serverCheck()` serverFn bodies for RPC
- `middleware.ts` — `/__scenetest/run` endpoint, AsyncLocalStorage for result collection
- `virtual-module.ts` — Virtual module system for extracted assertions
- `config.ts` — Plugin config loading
- The panels the plugin injects live elsewhere: observer in `@scenetest/checks/panel` (hard dep), recorder in `@scenetest/scenes/recorder` (optional peer, opt-in via `recorder: true`)

### ESLint Plugin (`packages/eslint-plugin/src/`)
- `index.ts` — Plugin entry, `recommended` flat config preset
- `rules/prefer-aria-label.ts` — Rule: prefer `aria-label` over `data-testid` for selectors
- `rules/inline-server-fn.ts` — Rule: `serverCheck()`'s server function must be an inline function literal (the Vite plugin extracts it statically; a variable reference can't be)

### VS Code Extension (`packages/vscode-scenetest/`)
- `package.json` — Extension manifest (language ID `scenetest-spec`, grammar registration)
- `syntaxes/scenetest-spec.tmLanguage.json` — TextMate grammar for `.spec.md` scene specs
- `language-configuration.json` — Comment toggling, folding, bracket config

### Example App (`examples/react/src/`)
- `App.tsx` — Working example with `should()`, `failed()`, `useCheck`, multi-context comparisons

---

## Vite Plugin

- **Dev mode**: Injects observer script via `transformIndexHtml`, registers RPC middleware
- **Production**: Strips all @scenetest/* package imports and calls via Babel AST transform
- **Imports stripped**: `@scenetest/checks` and all its subpaths (`/react`, `/vue`, `/solid`, `/svelte`, `/runtime`); the pre-0.12 standalone binding packages (checks-react etc.) remain in the strip list so unmigrated apps still strip cleanly
- **Plugin options**: `strip` (force), `devPanel` (show observer), `demo` (keep code + panel in prod), `csp` (Content-Security-Policy config)
- **CSP**: Opt-in middleware (`csp: true`), disabled by default to avoid breaking external resources (Google Fonts, CDNs, etc.)

### Dev panel injection architecture

The observer and recorder panels are injected into the consumer's dev page using Vite's **virtual module pattern** — NOT custom middleware routes. This is important and was learned the hard way:

- `transformIndexHtml` injects `<script type="module" src="/@scenetest/observer.js">` (external script tag)
- `resolveId` intercepts `/@scenetest/observer.js` and returns it as a virtual module
- `load` returns bootstrap code: `import '@scenetest/checks/panel'`
- `resolveId` also intercepts that specifier and resolves it via `import.meta.resolve()` from the plugin — the observer through the plugin's own `@scenetest/checks` dependency, the recorder through its `@scenetest/scenes` optional peer. This defeats **pnpm strict hoisting** (transitive deps aren't visible from the project root); if the plugin-relative resolve fails, returning null falls through to Vite's normal resolution from the consumer root, where scenes is a direct devDependency in any scenetest app

**Why not middleware?** Previous approaches tried to serve the observer via a custom middleware route that manually called `server.transformRequest()`. This broke because:
1. `createRequire` (CJS resolution) can't match `import`-only package.json exports
2. `server.transformRequest()` with `/@fs/` paths fails for symlinked workspace packages outside the consumer's `server.fs.allow` scope
3. Inline `<script type="module">import 'bare-spec'</script>` fails because the browser parses bare specifiers *before* Vite can transform them

**The correct pattern:** `resolveId` + `load` virtual modules with `<script src="">` tags. The browser requests the URL → Vite intercepts → plugin pipeline resolves bare imports. This is the standard approach used by vite-plugin-inspect, vite-plugin-pwa, and @vitejs/plugin-react.

### @babel/traverse type compatibility

`@types/babel__traverse@7.28+` changed the default export type to a namespace (not callable). The runtime ESM/CJS interop works fine, but TypeScript complains. We cast through `_traverse.TraverseOptions` instead of `typeof _traverse`.

### Tracking vite security advisories

The plugin keeps a wide vite peer range (`^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`) so consumers on any recent major can install it. To avoid silently shipping the plugin on top of a vulnerable vite, `packages/vite-plugin/src/index.ts` checks the consumer's resolved vite version against `MIN_SECURE_VITE_BY_MAJOR` at `configResolved` and logs a one-time `console.warn` if it's below the known-patched floor.

**Maintenance:** review `MIN_SECURE_VITE_BY_MAJOR` roughly every 3–4 months, or whenever a new vite advisory appears at https://github.com/vitejs/vite/security/advisories. Bump the per-major floor to the lowest patch in that line that carries the fix. Drop a major from the map once we decide it's unsupported and the warning no longer applies (e.g. if vite 5 is fully EOL and we want to stay quiet for those users, or conversely bump the floor to an impossibly-high value to always warn).

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

## Docs Site (`docs/`)

TanStack Start + Nitro app, deployed to **Cloudflare Workers** via `pnpm -C docs deploy` (`NITRO_PRESET=cloudflare_module vite build` → `wrangler deploy`). The worker is configured in `docs/wrangler.toml`. Local preview: `pnpm -C docs preview`.

**Cloudflare Workers Builds config** (dashboard, not repo): Workers Builds auto-installs the entire workspace before the build command — including the `examples/*` apps the docs don't need. The dashboard is configured with the build variable `SKIP_DEPENDENCY_INSTALL=true` and build command `pnpm install --filter "@scenetest/docs..." && pnpm run build` so only the docs app and its dependency chain are installed. If docs builds ever fail with missing workspace deps, check that this variable and command are still set.

- Markdown pages (home, `/guides/*`, `/reference/*`, `/faq/*`) live in `docs/public/**/*.md` and are also served as raw `.md` for `llms.txt` / copy-markdown.
- **Markdown is loaded server-side for SSR**, so LLMs and crawlers see the content without running JS. The route loader calls `getMarkdown(path)` from `docs/app/lib/markdown.ts`, which reads from an `import.meta.glob('../../public/**/*.md', { query: '?raw', eager: true })` map. Content is bundled at build time — no runtime fs access, which Workers wouldn't have anyway.
- `MarkdownSection` takes the markdown as a `content` prop and renders synchronously. It has no fetch path — if a new route needs markdown, wire the loader.
- `vite-plugin-llms-txt.ts` emits `/llms.txt` + `/llms-full.txt` by scanning `public/`.
- `vite-plugin-md-nav.ts` appends a sitemap footer to every served `.md` file (dev middleware + post-build walk of `.output/public`).

---

## What's Not Yet Implemented

| Feature | Status | Design doc |
|---------|--------|-----------|
| `serverCheck()` multi-context (server-side assertions) | Stubbed, infrastructure scaffolded, not wired E2E | `server-actions.md` |
| Network layer (`network.fail()`, `network.mock()`) | Design only | `cli-v2.md` section 7 |
| Snapshots (`snapshot()`, `expectSnapshot()`) | Design only | `cli-v2.md` section 8 |
| Dashboard & JSONL reports | Design only | `dashboard.md` |
| Receiver core as a cloud-mountable Hono app (D1/DO sinks) | `@scenetest/receiver` landed; cloud worker mounting pending | `architecture.md` in scenetest-cloud |
| Cloud WebSocket transport adapter for `@scenetest/dashboard` | Widget + dev (SSE) adapter landed; cloud adapter lives in scenetest-cloud | `architecture.md` in scenetest-cloud |
| Interactive UI mode (`--ui`) | Stub only | `cli-v2.md` |
| Visualization (timeline/musical) | Conceptual | `cli-v2.md` section 10 |
