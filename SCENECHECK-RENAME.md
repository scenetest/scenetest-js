# Scenecheck Rename — Handoff Document

## Branch: `feat/scenecheck-rename`

### What's been done (3 commits)

#### Commit 1: `f05666e` — Wire assert() multi-context E2E and unify config
Changes to **old** packages (packages/scenetest, observer, vite-plugin, etc.):
- Added `assertionId` to observer types for server badge detection
- Added `[server]` badge rendering in panel and fullscreen views
- Moved `ScenetestConfig` and `defineConfig` to `@scenetest/core`
- CLI config extends core config type
- Removed `defineScenetestConfig` from vite-plugin
- Framework bindings re-export `defineConfig`
- Unified `scenetest.config.ts` with `serverFunctions` for example app

#### Commit 2: `79d800f` — Scaffold new @scenecheck/* package structure
Created new directories with **copied** source files:
- `packages/checks/` — merges core + observer + playwright
- `packages/scenes/` — merges CLI + recorder
- `packages/vite/` — from vite-plugin
- `packages/checks-react/`, `checks-vue/`, `checks-solid/`, `checks-svelte/`

#### Commit 3: `5e3b4b2` — Rename scenetest→scenecheck across new packages
All **main source files** (not tests) in the new packages have been renamed:
- Package imports: `@scenetest/*` → `@scenecheck/*`
- Internal symbols: `__scenetest_*` → `__scenecheck_*`
- CSS classes: `scenetest-*` → `scenecheck-*`
- Types: `ScenetestConfig` → `ScenecheckConfig`, `ScenetestReporter` → `ScenecheckReporter`
- API functions: `useTestEffect` → `useCheck`, `watchTestEffect` → `watchCheck`, `createTestEffect` → `createCheck`, `testEffect` → `checkEffect`
- Config file patterns: `scenetest.config.*` → `scenecheck.config.*`
- URL paths: `/__scenetest/*` → `/__scenecheck/*`
- Plugin function: `scenetest()` → `scenecheck()`
- Virtual module: `virtual:scenetest-assertions` → `virtual:scenecheck-assertions`

New `package.json` and `tsconfig.json` files created for all 7 new packages.

---

### What's left to do

#### 1. Rename test files
Test files in `__tests__/` directories were intentionally skipped. They need the same import/symbol renames:
- `packages/checks/src/__tests__/` (3 test files)
- `packages/scenes/src/__tests__/` (6 test files)
- `packages/vite/src/__tests__/` (2 test files)
- `packages/scenes/vitest.config.ts`

#### 2. Update workspace root files
- `pnpm-workspace.yaml` — already includes `packages/*` so new dirs are covered, but verify
- Root `package.json` — update script references:
  - `@scenetest/core` → `@scenecheck/checks`
  - `@scenetest/cli` → `@scenecheck/scenes`
  - `@scenetest/vite-plugin` → `@scenecheck/vite`
  - `@scenetest/observer` → `@scenecheck/checks` (observer subpath)
  - Monorepo name: `scenetest-monorepo` → `scenecheck-monorepo`
  - Build order in scripts

#### 3. Update example apps
- `packages/example-app-react/` — update imports, config file rename, `vite.config.ts` plugin import
- `packages/example-app-vue/` — same
- `packages/example-app-solid/` — same
- `packages/example-app-svelte/` — same
- Each needs: `scenetest.config.ts` → `scenecheck.config.ts`, all `@scenetest/*` → `@scenecheck/*`

#### 4. Delete old package directories
Once everything builds, remove:
- `packages/scenetest/`
- `packages/scenetest-react/`
- `packages/scenetest-vue/`
- `packages/scenetest-solid/`
- `packages/scenetest-svelte/`
- `packages/scenetest-cli/`
- `packages/vite-plugin/`
- `packages/observer/`
- `packages/playwright-scenetest/`
- `packages/recorder/`

#### 5. Update CLAUDE.md
Major rewrite needed — all package names, file paths, descriptions reference old names.

#### 6. Update design docs
Files in `docs/public/design/` reference old package names throughout.

#### 7. Move `defineConfig` to `@scenecheck/vite`
Per the architectural discussion: the vite plugin owns config. Currently `defineConfig` lives in `@scenecheck/checks` (was core). It should move to `@scenecheck/vite` and the framework bindings should re-export from there (or from checks which re-exports from vite).

#### 8. Build and test
- `pnpm install` (to pick up new packages)
- Build order: `@scenecheck/checks` first, then `@scenecheck/scenes` + `@scenecheck/vite` + framework bindings
- Run tests: `pnpm -r test`
- Typecheck: `pnpm -r typecheck`

---

### New package mapping

| Old package | New package | Notes |
|---|---|---|
| `@scenetest/core` | `@scenecheck/checks` | Merges core + observer + playwright |
| `@scenetest/observer` | `@scenecheck/checks/observer` | Subpath export |
| `@scenetest/playwright` | `@scenecheck/checks/playwright` | Subpath export |
| `@scenetest/cli` | `@scenecheck/scenes` | Merges CLI + recorder |
| `@scenetest/recorder` | Part of `@scenecheck/scenes` | Internal to scenes |
| `@scenetest/vite-plugin` | `@scenecheck/vite` | Owns config |
| `@scenetest/react` | `@scenecheck/checks-react` | |
| `@scenetest/vue` | `@scenecheck/checks-vue` | |
| `@scenetest/solid` | `@scenecheck/checks-solid` | |
| `@scenetest/svelte` | `@scenecheck/checks-svelte` | |

### API renames

| Old | New |
|---|---|
| `useTestEffect` | `useCheck` |
| `watchTestEffect` | `watchCheck` |
| `createTestEffect` | `createCheck` |
| `testEffect` | `checkEffect` |
| `scenetest()` (plugin) | `scenecheck()` |
| `ScenetestConfig` | `ScenecheckConfig` |
| `ScenetestReporter` | `ScenecheckReporter` |
| `scenetest.config.ts` | `scenecheck.config.ts` |

### Internal symbol renames

All `__scenetest_*` → `__scenecheck_*` (report, pending, rpc, panel, openInEditor, etc.)

### Key architectural decisions from this session
1. **Two domains**: "scenes" (runner/actors/recorder) and "checks" (assertions/observer/playwright)
2. **Vite plugin is the main character** — it wires both domains into the dev build, owns config
3. **`defineConfig` should live in `@scenecheck/vite`** (not yet moved)
4. **One unified dev panel** for both observer and recorder views (not yet merged)
5. **`scenecheck` npm name is available** — verified during session
