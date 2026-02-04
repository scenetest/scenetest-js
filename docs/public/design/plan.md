# Scenetest Roadmap & Plan

**STATUS: Active** — Living document tracking what ships and in what order.

---

## Current state

Scenetest has a working end-to-end system:

- Inline assertions: `should()`, `failed()`, `match()`
- Multi-context assertions: `serverCheck()` — browser collects data, server executes checks, results flow back to dev panel and Playwright
- Two scene authoring models: `scene()` (concurrent) and `test()` (classic driver), with unified `waitFor`/`emit` coordination across both
- Text DSL with `.spec.md` support
- Vite plugin: dev panel injection, `serverCheck` transform + middleware, production stripping
- Observer dev panel, Playwright fixtures, framework bindings (React/Vue/Solid/Svelte), VSCode extension

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

## Phase 1: JSONL reports & viewer

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

## Phase 2: Network layer

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

## Phase 3: Snapshots

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

## Phase 4: CI integration

**Priority: Medium — depends on Phase 1 (JSONL reports).**

### Implementation

- GitHub Action (`scenetest/upload-report@v1`) to upload `.reports/` artifacts
- PR comment generation: summary table with pass/fail counts, regressions, new assertions, timing changes
- Link to hosted comparison view (or self-hosted viewer URL)

### Artifacts

- [ ] GitHub Action publishes report and posts PR comment
- [ ] PR comment shows regressions and new assertions at a glance

---

## Phase 5: Interactive UI mode (`--ui`)

**Priority: Low — quality-of-life, not blocking adoption.**

Design: [`cli-v2.md`](cli-v2.md) section 10

- Browser-based scene editor with autocomplete
- Run scenes against dev server or preview deploy
- Watch assertions populate in real-time
- Save commits to repo

---

## Phase 6: Visualization

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
| 1 | JSONL reports & viewer | High | — | `dashboard.md` |
| 2 | Network layer | Medium | Phase 0 | `cli-v2.md` §7 |
| 3 | Snapshots | Medium | Phase 0 | `cli-v2.md` §8 |
| 4 | CI integration | Medium | Phase 1 | `dashboard.md` |
| 5 | Interactive UI | Low | — | `cli-v2.md` §10 |
| 6 | Visualization | Low | Phase 1 | `cli-v2.md` §10 |

Phases 0 and 1 are independent and can progress in parallel. Phase 0 should be resolved before Phases 2 and 3 since network and snapshot APIs differ between execution models. Phase 4 depends on Phase 1's JSONL format being stable.
