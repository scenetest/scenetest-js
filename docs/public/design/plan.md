# Scenetest Roadmap & Plan

**STATUS: Active** — Living document tracking what ships and in what order.

---

## Current state

Scenetest has a working end-to-end system: inline assertions (`should`, `failed`, `match`), two scene authoring models (`scene()` concurrent and `test()` classic driver), a text DSL with `.spec.md` support, a Vite plugin (dev panel injection + production stripping), the observer dev panel, Playwright fixtures, framework bindings for React/Vue/Solid/Svelte, and a VSCode extension.

The project is pre-v1.0. Real-world evaluation is happening on [sunlo.app](https://sunlo.app).

---

## Phase 0: Execution model decision

**Priority: Blocking — must resolve before v1.0.**

We ship one execution model, not two. Both `scene()` (concurrent) and `test()` (classic driver) are implemented. The decision is based on real-world usage — see [`scene-vs-flow.md`](scene-vs-flow.md) for the full evaluation framework.

### What needs to happen

1. **Accumulate usage data** — Write real specs for sunlo.app using both models. Track which model gets reached for instinctively, where each one fights you, and which produces better error messages.

2. **Make the call** — Apply the five decision criteria from `scene-vs-flow.md`:
   - How often do you need `Promise.all` in multi-actor classic driver specs?
   - How often do you need `emit`/`waitFor` in concurrent specs?
   - Which produces better errors?
   - Which is easier to explain to someone new to E2E testing?
   - Which do you instinctively reach for?

3. **Remove the loser** — The cleanup is mechanical (documented in `scene-vs-flow.md`). If concurrent wins, the text DSL works as-is. If classic driver wins, the markdown parser needs rewriting or `scene()` stays as an internal mechanism for `.spec.md` only.

### Artifacts

- [ ] Decision documented with rationale
- [ ] Losing model removed from codebase
- [ ] Shared helpers extracted if concurrent wins (selector resolution, scope management currently duplicated in `reactive.ts` and `actor.ts`)
- [ ] All example specs, docs, and README updated

---

## Phase 1: Multi-context assertions (`assert()`)

**Priority: High — core differentiator, infrastructure already scaffolded.**

Design: [`server-actions.md`](server-actions.md)

`assert()` lets developers write browser+server assertions colocated in component code. The serverFn runs on the Vite dev server with database/API access. Results flow through the existing `__scenetest_report` channel to the dev panel and Playwright.

### Implementation steps

Each step is independently shippable and testable.

#### Step 1: Core transform
- Extend Vite plugin to detect `assert()` calls in source
- Extract `serverFn` bodies to a virtual module (`/__scenetest/assertions.js`)
- Transform call sites to `__scenetest_rpc({ id, title, withData })`
- Generate stable assertion IDs from file location + optional `key`

#### Step 2: Server middleware
- Add `POST /__scenetest/run` endpoint to Vite plugin middleware
- Load and execute extracted serverFns with `AsyncLocalStorage`-based result collection
- Return collected `should()`/`failed()` results as JSON
- Load `serverContext` from `scenetest.config.ts`

#### Step 3: Browser runtime
- Implement `__scenetest_rpc()` in `packages/scenetest/src/runtime.ts`
- Serialize `withData()` result, POST to server, report results via `__scenetest_report`
- Handle serialization errors and network errors gracefully (report as failed assertions, never crash the app)

#### Step 4: Configuration
- Define `serverFunctions` shape in `scenetest.config.ts`
- Load config in Vite plugin at dev server startup
- Create typed `ServerContext` from config
- Provide `declare module` pattern for TypeScript users

#### Step 5: Integration
- Update dev panel to show `[server]` badge on multi-context assertions
- Add pending assertion tracking (`window.__scenetest_pending`)
- Wire `waitForAssertions()` in Playwright fixture to poll pending count
- Production build strips `assert()` calls (same as `should()`/`failed()`)

### Artifacts

- [ ] `assert()` works end-to-end: browser collects data, server executes, results appear in dev panel
- [ ] Playwright fixture collects multi-context results without modification
- [ ] `waitForAssertions()` handles async server round-trips
- [ ] Production build strips all `assert()` calls cleanly

---

## Phase 2: JSONL reports & viewer

**Priority: High — enables CI integration, historical comparison, regression detection.**

Design: [`dashboard.md`](dashboard.md)

### Implementation steps

#### Step 1: JSONL writer
- Add report writer to `playwright-scenetest` — after scene run, write JSONL to `.reports/`
- Format: one JSON record per line — `meta` (commit, branch, timestamp), `assertion` (name, status, ms, actor, file, line), `warning`
- File naming: `{timestamp}-{commit}-{branch}.jsonl`
- Context objects excluded for security

#### Step 2: Report viewer page
- Standalone HTML page (or route in observer) with sidebar-detail layout
- Sidebar: assertion list with pass/fail icons and duration
- Detail: assertion metadata, actor, source location, error info
- Glob-scan `.reports/` directory, load all reports, filter/sort in JS

#### Step 3: Drop-in mode
- Drag JSONL file onto viewer page for instant offline exploration
- Zero config, works without a running dev server

#### Step 4: Comparison view
- Side-by-side diff of two report files
- Categories: New, Removed, Regression (pass->fail), Fixed (fail->pass), Timing changes
- Select reports by branch/commit from sidebar

### Artifacts

- [ ] Running `pnpm scenetest run --report` writes JSONL to `.reports/`
- [ ] Report viewer opens in browser and lists historical runs
- [ ] Drag-and-drop JSONL works offline
- [ ] Two reports can be compared side-by-side

---

## Phase 3: Network layer

**Priority: Medium — environment control for error/loading state testing.**

Design: [`cli-v2.md`](cli-v2.md) section 7

### API surface

```typescript
network.fail(urlPattern)          // Inject network failure
network.mock(urlPattern, data)    // Mock response
network.delay(urlPattern, ms)     // Add latency
```

### Implementation

- Expose `network` in scene context alongside `actor`
- Use Playwright's `page.route()` for interception
- Scope to individual actors (per-browser) or global
- Reset between scenes automatically
- Not for asserting API calls were made — environment control only

### Artifacts

- [ ] `network.fail()`, `network.mock()`, `network.delay()` work in both execution models
- [ ] Scoped to actor or global
- [ ] Automatic cleanup between scenes

---

## Phase 4: Snapshots

**Priority: Medium — DOM state comparison for cancel/undo/restore flows.**

Design: [`cli-v2.md`](cli-v2.md) section 8

### API surface

```typescript
const before = await user.snapshot('profile-card')
// ... do things ...
await user.expectSnapshot('profile-card', before)
```

### Open questions

- Which DOM attributes to include/exclude (dynamic IDs, timestamps)
- Snapshot storage format
- Diff visualization in reports and dev panel
- Integration with JSONL reports (store snapshots separately, reference by hash?)

### Artifacts

- [ ] `snapshot()` captures serialized DOM state for a selector
- [ ] `expectSnapshot()` compares current state to a previous snapshot
- [ ] Meaningful diff output on mismatch

---

## Phase 5: CI integration

**Priority: Medium — depends on Phase 2 (JSONL reports).**

### Implementation

- GitHub Action (`scenetest/upload-report@v1`) to upload `.reports/` artifacts
- PR comment generation: summary table with pass/fail counts, regressions, new assertions, timing changes
- Link to hosted comparison view (or self-hosted viewer URL)

### Artifacts

- [ ] GitHub Action publishes report and posts PR comment
- [ ] PR comment shows regressions and new assertions at a glance

---

## Phase 6: Interactive UI mode (`--ui`)

**Priority: Low — quality-of-life, not blocking adoption.**

Design: [`cli-v2.md`](cli-v2.md) section 10

- Browser-based scene editor with autocomplete
- Run scenes against dev server or preview deploy
- Watch assertions populate in real-time
- Save commits to repo

---

## Phase 7: Visualization

**Priority: Low — aspirational, depends on JSONL reports.**

Design: [`cli-v2.md`](cli-v2.md) section 10

- Separate package: `@scenetest/visualizer`
- Reads JSON/JSONL reports
- Actor timelines rendered as musical performance
- Each actor as an instrument, warning hotspots highlighted
- Playback of scenes as "music"

---

## Future considerations

- **Hosted dashboard** — managed solution with live DSL editor, cross-org insights, branch/merge bug flow analysis (see [`ideas.md`](ideas.md))
- **Execution model shared helpers** — if concurrent model wins Phase 0, extract selector resolution and scope management from both `reactive.ts` and `actor.ts` into shared utilities
- **Framework-specific deep integration** — beyond hooks (e.g., component tree awareness, state inspection)

---

## Summary table

| Phase | Feature | Priority | Depends on | Design doc |
|-------|---------|----------|------------|------------|
| 0 | Execution model decision | Blocking | Usage data | `scene-vs-flow.md` |
| 1 | Multi-context assertions | High | — | `server-actions.md` |
| 2 | JSONL reports & viewer | High | — | `dashboard.md` |
| 3 | Network layer | Medium | Phase 0 | `cli-v2.md` §7 |
| 4 | Snapshots | Medium | Phase 0 | `cli-v2.md` §8 |
| 5 | CI integration | Medium | Phase 2 | `dashboard.md` |
| 6 | Interactive UI | Low | — | `cli-v2.md` §10 |
| 7 | Visualization | Low | Phase 2 | `cli-v2.md` §10 |

Phases 0, 1, and 2 are independent and can progress in parallel. Phase 0 should be resolved before Phases 3 and 4 since network and snapshot APIs differ between execution models. Phase 5 depends on Phase 2's JSONL format being stable.
