# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Scenetest is

Scenetest is a scene-driven, concurrent-actor end-to-end testing framework for JavaScript apps, with inline checks and simpler specs.

The API is not stable. Treat a breaking change as normal, and follow the versioning rule below.

One caveat that changes how you write code: `serverCheck()` (multi-context, server-side assertions) is stubbed. The infrastructure exists, but it is not wired end to end.

The README.md has the public-facing overview. Design docs live in `docs/public/design/`.

## Status and roadmap

Every design doc in `docs/public/design/` opens with its own `**STATUS:**` header, and that header is the source of truth for what is built. Pending work lives in GitHub issues.

Do not restate feature status in this file, and do not record how a subsystem reached its current shape. Both go stale here, and both stay current in the design docs and the issues.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Start example app dev server
pnpm dev:rebuild      # Rebuild plugin then start dev server
pnpm typecheck        # Type check all packages
pnpm -r test          # Run all unit tests across packages
```

## Releasing & Versioning

**Per-package semver, with a monorepo accumulator.** Each published package is versioned by its own change — bump only the packages a release actually touches, in their `package.json`. (Pre-1.0, a breaking change rides the **minor** slot, e.g. `0.12.0 → 0.13.0`; additive changes are also minor; fixes are patch.) Cross-package deps are `workspace:*`, so a bump never forces a range update elsewhere.

The private root `scenetest-monorepo` `version` is a marker (never published) that **bumps by the strongest bump in each release**: any package minor → root minor (`0.16.0 → 0.17.0`); a patch-only release → root patch (`0.16.0 → 0.16.1`). It therefore stays at or ahead of the highest package version by construction — don't compute it as `max(versions)` (a single fast-moving package could outrun that); accumulate it per release.

Per release:
1. Bump the changed packages' versions (+ the root per the rule above).
2. Add a dated, per-package entry at the top of `CHANGELOG.md` in the existing form: `## <date> — monorepo <v> · @scenetest/<pkg> <v>, …`, with an `### @scenetest/<pkg> <v>` subsection per bumped package.
3. Commit as `release: monorepo <v> (@scenetest/<pkg> <v>, …)` — a standalone commit on top of the work it ships. This is a manual convention; nothing tools it.

## Package Structure

```
packages/                   # Published packages
├── checks/                 # Core library — should(), failed(), serverCheck(), match(); framework bindings as subpath exports (./react, ./preact, ./vue, ./solid, ./svelte) with optional peer deps; observer panel UI as ./panel (vite-free, works under any bundler)
├── protocol/               # Wire protocol — typed event/command vocabulary + codec shared by CLI, plugin, dashboard, cloud
├── receiver/               # Receiver core — framework-agnostic Hono app that accepts protocol events and fans them out to sinks
├── dashboard/              # Embeddable Preact dashboard component — <Dashboard> + transport adapter, shared by dev and cloud
├── scenes/                 # CLI runner — scene(), test(), actor DSL, selectors, teams, config; recorder panel UI as ./recorder subpath (vite-free DOM code, versions in lockstep with the DSL it emits)
├── vite-plugin/            # Vite plugin — dev panel injection, prod stripping, RPC middleware; injects the observer from @scenetest/checks/panel and the recorder from @scenetest/scenes/recorder (optional peer)
├── playwright-scenetest/   # @scenetest/playwright — the scenePage Playwright fixture that collects inline assertion results
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
- `react.ts` / `preact.ts` / `vue.ts` / `solid.ts` / `svelte.ts` — framework bindings (`useCheck` for react and preact, `watchCheck`, `createCheck`, `checkEffect`). Each re-exports the core API, so app code imports from one place
- `panel/` — the observer panel (panel, fullscreen viewer, history, audio), subpath export `./panel`, auto-initializing on import. Dependency-free DOM code hooking `window.__scenetest_report`, so it works under any bundler with no Vite. User-facing docs: `docs/public/reference/observer-panel.md`
- `skills/inline-assertions/SKILL.md` — shippable Agent Skill (TanStack Intent) teaching `should()`/`failed()`/`serverCheck()` authoring. Shipped in the npm tarball (`files` includes `skills`, `tanstack-intent` keyword). Validate with `pnpm -C packages/checks skills:validate`. **Keep it in sync with `docs/public/guides/writing-inline-assertions.md`**

### Protocol (`packages/protocol/src/`)
- `events.ts` — the `RunEvent` union (`run:start` … `run:end`, the `run:progress` rollup, `run:paused`/`run:resumed`), `TeamMeta`, `RunSummary`, `PROTOCOL_VERSION`
- `commands.ts` — the `Command` union (`run:replay`, `run:stop`, `run:pause`, `run:resume`)
- `codec.ts` — `encodeEvent()`/`decodeEvent()` (strict, never throws), `isEventShaped()` (envelope-only, so relays pass through event types newer than themselves)

Constraints:
- Every event carries a required `runId` — the `run:start` timestamp, stamped by producers via `dashboardSend`. It is required in the strict shape and codec like `name`/`file`, but **not** in the lenient `isEventShaped` relay envelope.
- `run:paused`/`run:resumed` are past-tense facts, emitted when a pause or resume command is enacted — never when one is received.
- Zero-dependency package, and the seam between the dev tool and scenetest-cloud. Route wire-format changes through a published release so version skew stays visible.
- `@scenetest/scenes` re-exports `RunEvent` as `DashboardEvent` for backwards compatibility.

### Receiver (`packages/receiver/src/`)
- `app.ts` — `createReceiverApp({ sinks, onCommand? })`, a Hono app with `POST /events` (envelope-validated via `isEventShaped()`, calls sink `clear?.()` on `run:start`) and `POST /commands` (decodes a `Command` strictly via `decodeCommand`, dispatches to `onCommand` with `{ runId }` metadata). `ReceiverAppType` for `hono/client`
- `sink.ts` — the `Sink` interface (`write()`, optional `clear()`) and `JsonlSink` (one protocol event per JSON line, lazy open, `close()`)
- `command.ts` — `CommandHandler`/`CommandMeta`, the host-supplied handler that `/commands` dispatches to
- `node.ts` — `toNodeHandler(app)` via `@hono/node-server`'s `getRequestListener`, for mounting in connect-style servers

Constraints:
- It is a relay. Envelope-only validation passes through event types newer than itself, and **every response is 200** (`{"ok":true}`/`{"ok":false}`), because producers on both paths are fire-and-forget.
- The receiver decodes and routes only. Actuation is process-local — a child process in dev, a `RunController` in the box/CLI.
- `runId` is metadata, never an address. Commands target the active run.
- The receiver never logs commands. Only their *effects* re-enter the event stream.
- Only this package may depend on `hono`/`@hono/node-server`.

The command path (one `onCommand`, reached through a transport-specific door) is explained in `packages/receiver/README.md`.

### Dashboard (`packages/dashboard/src/`)

**Nomenclature:** the *Dashboard* is the whole Preact app and all three of its views — **Home**, **Runner**, **Waterfall**. There is no "Console"; that name is retired.

It is a plain light-DOM Preact app written in TSX (the package has a build step, so no htm). CSS ships as `style.css` scoped under `.scenetest-dashboard`, imported by the host as `@scenetest/dashboard/style.css`. The observer panel in `@scenetest/checks/panel` keeps its own shadow root; the dashboard has none. Views read the collections reactively through `useLiveQuery`, never a hand-rolled `subscribeChanges`. Dev and cloud render this same component, and only the transport differs.

- `dashboard.tsx` — `<Dashboard>`, mounted on a single route with an optional trailing param, `{base}/:view?`. That one pattern matches the base and each view, and the component reads the matched segment via `useRoute().params.view`. Props `{ transport, theme?, basePath?, apiBase?, path?, default? }`
- `browser-dashboard.tsx` — `<BrowserDashboard>` wraps `<Dashboard>` in the one `LocationProvider` a top-level app must own, so `render(<BrowserDashboard transport={…} />)` gives a standalone host a complete, deep-linkable app
- `runner.tsx` — the Runner view: `RunnerView` + `Tree`/`ListPane`/`Detail`/`SpecSnippet`/`CopyButton`
- `select-runner.ts` — `selectSnapshot(slice)` derives per-scene assertions and timeline via `attributeToScene`; `mapReportToSnapshot()` adapts a past-run JSON report into the same shape
- `app.tsx` — the Waterfall view `{ state, send }` + `Header`/`SceneCard` + `sceneSummary()`. A pure view
- `select-waterfall.ts` — `selectWaterfall(slice)` derives the Waterfall's lanes by actor, attributed assertions, and run rollup + `completedSceneCount`
- `use-run-slice.ts` — `useRunSlice(collections)` builds the latest-run slice as `createLiveQueryCollection` derived collections. `runSliceCollections(collections, runId)` is the pure builder
- `use-live-query.ts` — `useLiveQuery(collection)`, the Preact analogue of `@tanstack/react-db`'s hook
- `select-helpers.ts` — `latestRunId()`, `latestRunSlice()`, and the `DashboardCollections`/`RunSlice` types
- `dev-transport.ts` — `createDevTransport()`: fetch + SSE adapter, mapping `Command`s to `/__scenetest/replay|stop|pause|resume`
- `types.ts` — `Transport`, `DashboardState`, `Scene`, `DashboardTheme`, `ConnectionStatus`
- `style.css` — the whole app's stylesheet, scoped under `.scenetest-dashboard`, with the Waterfall's bare-element rules confined to `.waterfall-host`
- `collections/` — the read-only TanStack DB read model over the run stream, subpath export `./collections`

Constraints:

- **Routing rides on one `preact-iso` router owned by the host.** A host that already owns a `LocationProvider` (cloud) adds `:view?` to its own PR route and renders the bare `<Dashboard basePath={prMount} />`. Because every view matches the one route, `<Dashboard>` stays mounted across view changes and the store survives.
- **Two bases, on purpose.** `basePath` (default `/__scenetest`) only builds the absolute, deep-linkable tab `<a>` hrefs — view selection itself is relative. `apiBase` (defaults to `basePath`) bases the Runner's server-endpoint fetches, because cloud's API lives somewhere other than its router.
- **`useDashboardStore(transport)` builds the four collections once** (`scenesProjection`/`assertionsProjection`/`actionsProjection`/`runsProjection`, sharing one `createRunSource`) and passes them down. Each view reads only the tables it needs, so re-renders stay scoped.
- **Rows are partitioned by `runId`** and span a whole PR's history. A new `run:start` opens a new partition and does **not** truncate.
- **Projections are the sole writers.** They fold `RunEvent`s into a small `RowOp` vocabulary (`insert`/`update`/`delete`/`reset`) and are testable without TanStack DB. Client mutations throw.
- **`@tanstack/db` is a runtime `dependency`**, but the `./collections` subpath only `import type`s `CollectionConfig`. That is deliberate: a cloud consumer can build collections with its *own* `@tanstack/db` instance and join them against its own `useLiveQuery`.
- `attributeToScene` joins assertions and actions to scenes by stamped scene id when present, and otherwise by actor plus time window.
- The dev shell is a real Vite app at `packages/vite-plugin/app/` (~10 lines), built to `packages/vite-plugin/dist-app/` and served as static files at all view routes. Keep it a normal Vite build so `@tanstack/db` bundles natively.
- Routing is covered by `src/__tests__/routing.test.tsx` (jsdom: deep-link to each view, click-to-navigate, non-default base).

Design doc: `docs/public/design/unified-console.md`.

### Scenes (`packages/scenes/src/`)
- `scene.ts` — `test()` registration (await-driven), the shared `registerScene()` helper, `runScene()`, session accessors
- `actor.ts` — `SequentialActorHandleImpl` with all DSL methods; `ActionChainImpl` with scope tracking (the await-driven `test()` model)
- `reactive.ts` — `ConcurrentActorHandleImpl`, `drainAll()`, `scene()` registration (the reactive queue-building model)
- `selectors.ts` — `resolveSelector()`, `explainSelector()`, alias registry
- `dsl.ts` — `runDsl()`, `defineMacro()`, `runMacro()`, the text DSL parser
- `message-bus.ts` — `MessageBus` with sticky messages
- `team-manager.ts` — `TeamManager` with pool acquire/release for parallel execution
- `runner.ts` — `SceneRunner` with scene discovery, browser init, lifecycle hooks. `attachController()` wires a `RunController` consulted at each scene boundary
- `run-controller.ts` — `RunController`: the in-process actuator for inbound commands. `dispatch(command, meta?)` → cooperative `gate()`/`pause`/`resume`/`stop`; `onPaused`/`onResumed` hooks let the CLI emit events on real transitions
- `command-channel.ts` — `watchCommandFile(path, onCommand)` tails a JSONL command file, decoding each appended `Command` line
- `cli.ts` — CLI entry point and JSON report generation. `--command-file`/`SCENETEST_COMMAND_FILE` builds a `RunController` + `watchCommandFile` and wires its hooks. The `teams` subcommand (`--json`) lists configured teams for the dashboard picker
- `keyboard.ts` — `NavigationModeRotation`, `tabToElement()`, `pressEnter()`, `clearAndType()`, fuzzy-finger helpers, `FuzzyFingerError`
- `config.ts` — `loadConfig()`, `findConfigFile()`, `defineConfig()`, team discovery
- `types.ts` — all type definitions (`ScenetestConfig`, `SequentialActorHandle`, `ActionChain`, `ConcurrentActorHandle`, `SceneContext`)
- `playwright-install.ts` — `resolvePlaywrightCli()`, `installBrowsers()`, and the two setup-failure predicates behind `scenetest install`
- `recorder/` — the scene recorder panel (capture, reverse-selector, panel UI), subpath export `./recorder`, auto-initializing on import. Pure DOM code with no Vite coupling

Constraints:
- **playwright is a peer dependency.** The consumer supplies it, so its bin is linked and one copy backs both the browser download and the run. `cli.ts` therefore imports `runner.js` lazily — the runner imports playwright at module scope, and `scenetest install` has to stay reachable on a project that has not installed it yet.
- Stop is cooperative. `isStopped` breaks the run loop, so the CLI emits a graceful `run:end` with a partial summary; `gate()` parks the loop while paused.
- `RunController` is run-agnostic. There is no run id, and `meta.runId` is logged but never gates the action.
- `run:replay` is a no-op inside `RunController`. Relaunching is the supervisor's job — the CLI in dev, the driver in cloud.
- `watchCommandFile` buffers partial lines, tolerates a not-yet-created file, handles truncation, and skips malformed lines.

### Vite Plugin (`packages/vite-plugin/src/`)
- `index.ts` — main plugin (dev: inject observer + middleware; prod: strip)
- `strip.ts` — AST-based removal of scenetest imports and calls
- `transform.ts` — extract `serverCheck()` serverFn bodies for RPC
- `middleware.ts` — the `/__scenetest/run` endpoint (AsyncLocalStorage for result collection), the run controls, and `GET /__scenetest/teams`
- `virtual-module.ts` — virtual module system for extracted assertions
- `config.ts` — plugin config loading

Constraints:
- The panels the plugin injects live elsewhere: the observer in `@scenetest/checks/panel` (hard dep), the recorder in `@scenetest/scenes/recorder` (optional peer, opt-in via `recorder: true`).
- Every run control goes through the CLI, the same as cloud. `/replay` spawns the CLI with `--command-file`; `/pause`, `/resume` and `/stop` append commands to that file. There is no `SIGSTOP` and no kill-as-Stop. The process-group kill remains only to discard a prior run on replay.
- The middleware delegates `POST /__scenetest/events` to the receiver core with the SSE `EventHub` as a sink, and `POST /__scenetest/commands` to the receiver's `/commands` route. Serving SSE stays in the middleware, because that is a dev-transport concern.

### ESLint Plugin (`packages/eslint-plugin/src/`)
- `index.ts` — plugin entry, `recommended` flat config preset
- `rules/prefer-aria-label.ts` — prefer `aria-label` over `data-testid` for selectors
- `rules/inline-server-fn.ts` — `serverCheck()`'s server function must be an inline function literal, because the Vite plugin extracts it statically and cannot follow a variable reference

### VS Code Extension (`packages/vscode-scenetest/`)
- `package.json` — extension manifest (language ID `scenetest-spec`, grammar registration)
- `syntaxes/scenetest-spec.tmLanguage.json` — TextMate grammar for `.spec.md` scene specs
- `language-configuration.json` — comment toggling, folding, bracket config

### Example App (`examples/react/src/`)
- `App.tsx` — working example with `should()`, `failed()`, `useCheck`, multi-context comparisons

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

---

## Docs Site (`docs/`)

TanStack Start + Nitro app, deployed to **Cloudflare Workers** via `pnpm -C docs deploy` (`NITRO_PRESET=cloudflare_module vite build` → `wrangler deploy`). The worker is configured in `docs/wrangler.toml`. Local preview: `pnpm -C docs preview`.

**Cloudflare Workers Builds config** (dashboard, not repo): Workers Builds auto-installs the entire workspace before the build command — including the `examples/*` apps the docs don't need. The dashboard is configured with the build variable `SKIP_DEPENDENCY_INSTALL=true` and build command `pnpm install --filter "@scenetest/docs..." && pnpm run build` so only the docs app and its dependency chain are installed. If docs builds ever fail with missing workspace deps, check that this variable and command are still set.

- Markdown pages (home, `/guides/*`, `/reference/*`, `/faq/*`) live in `docs/public/**/*.md` and are also served as raw `.md` for `llms.txt` / copy-markdown.
- A new page needs two edits: the markdown file under `docs/public/`, and an entry in `docs/app/sections.ts` so it appears in the nav.
- **Markdown is loaded server-side for SSR**, so LLMs and crawlers see the content without running JS. The route loader calls `getMarkdown(path)` from `docs/app/lib/markdown.ts`, which reads from an `import.meta.glob('../../public/**/*.md', { query: '?raw', eager: true })` map. Content is bundled at build time — no runtime fs access, which Workers wouldn't have anyway.
- `MarkdownSection` takes the markdown as a `content` prop and renders synchronously. It has no fetch path — if a new route needs markdown, wire the loader.
- `vite-plugin-llms-txt.ts` emits `/llms.txt` + `/llms-full.txt` by scanning `public/`.
- `vite-plugin-md-nav.ts` appends a sitemap footer to every served `.md` file (dev middleware + post-build walk of `.output/public`).

---

## Writing style for Humans

Applies to every string a human reads: chat, commit messages, PR bodies, code
comments, UI copy, errors, docs.

- **One word per meaning.** One action, one verb, everywhere — button, toast, error, docs, commit message.
- **Say which one you mean.** "The Vite build", not "the build" — even when there's only one build.
- **Active voice, simple tense, one claim per sentence.** Under ~25 words. Lists for 3+ steps.
- **Condition before consequence.** "If the deck is empty, the button stays disabled."
- **Name the specific thing.** "Deck saved" beats "Success"; "Keep editing" beats "OK". Cut "please", "simply", "just".
- **Match the channel.** A commit says why. A code comment says only what a cold maintainer needs. UI copy uses the user's words, never the codebase's.
- **No hype, no flattery, no dunking.** State the observation and stop.
- **Hedge honestly.** Say when you don't know. Mark estimates "≈". Report failures with the output.
- **State the options and recommend one** when the decision is mine. Don't settle it silently.
