---
name: team-configuration
description: >-
  Use when setting up or auditing Scenetest actor teams, credentials, seed data,
  auth warmup, and run configuration — everything under `scenetest/` that a
  scene depends on but isn't the scene itself. Covers the `scenetest/actors/`
  team files (`TeamConfig` / `defineTeam`), the `ActorConfig` shape (key,
  credentials, localStorage, warmup), how teams map 1:1 to seed data, how N
  teams give N parallel scenes, warmup-based auth caching, per-scene DB
  `cleanup:`/`setup:` directives, config hooks (beforeAll/beforeEach), and the
  `scenetest/config.ts` fields (baseUrl, aliases, consoleErrorAliases,
  errorSelectors, server). Apply whenever a task touches `scenetest/config.ts`,
  `scenetest/actors/**`, seed data, or asks "add a role / team / login".
  For writing the scenes themselves, see the scene-authoring skill.
---

# Configuring Scenetest Teams & Seed Data

A **team** is a complete, internally-consistent set of actors — one self-contained
"world" a scene runs in. Scenes reference actors by **role** (`actor('learner')`);
teams supply the credentials and identity behind each role. Get teams right and
scenes run reliably, concurrently, and without shared-state bugs.

```
scenetest/
├── config.ts          # run config (baseUrl, aliases, hooks, server) — NO actors
├── actors/            # one team per file (auto-discovered)
│   ├── team-maria.ts
│   └── team-john.ts
└── scenes/            # *.spec.md / *.spec.ts
```

## Actor teams live in `scenetest/actors/`

The `actors/` directory is **required**. Each `.ts`/`.js`/`.mjs` file's default
export is a team (or an array of teams). The config file itself defines **no**
actors.

```ts
// scenetest/actors/team-maria.ts
import type { TeamConfig } from '@scenetest/scenes'

export default {
  'primary-learner': {
    key: 'maria',                 // stable per-actor id (reports + [role.key])
    email: 'maria@test.com',
    password: 'test123',
    targetLanguage: 'spanish',    // arbitrary extra fields are allowed
  },
  'existing-friend': {
    key: 'carlos',
    email: 'carlos@test.com',
    password: 'test123',
  },
} satisfies TeamConfig
```

`TeamConfig` is `Record<roleName, ActorConfig>`. Alternatives:

- **Array export** — several teams in one file: `export default [ {...}, {...} ] satisfies TeamConfig[]`.
- **`defineTeam`** — attach metadata: `export default defineTeam({ actors: {...}, name: 'maria', tags: { plan: 'pro' } })`. `name` backs the `--team` filter; `tags` are readable in specs via `[team.field]`.

### `ActorConfig` fields

| Field | Type | Purpose |
| --- | --- | --- |
| `key` | `string` (**required**) | Stable identifier — appears in reports and `[role.key]` interpolation. Keep it unique per real user. |
| `username` / `email` / `password` | `string?` | Login credentials — whatever your app authenticates with. |
| `localStorage` | `Record<string,string>?` | Entries injected into the actor's browser **before each scene**. |
| `warmup` | `string \| (page, actor) => Promise<void>` | Runs **once at run start** to capture auth state — see below. |
| *(any extra)* | `unknown` | Pre-existing knowledge the actor "knows" (language, country…), readable via `[role.field]`. |

**What goes in actor config:** credentials + pre-existing knowledge. **Not**
database IDs or internal state — the actor discovers everything else through the
app. Passwords are **fixtures, not secrets** — use one obviously-fake value like
`test123` everywhere and assume it's public.

## Teams mirror your seed data

Every relationship a scene relies on must already exist in the database. The
actor files only provide credentials; **your seed data is the source of truth**
for what relationships exist.

```
seed: users(maria), users(carlos), friendships(maria, carlos)
team: 'primary-learner' → maria,  'existing-friend' → carlos
```

If a scene calls `actor('existing-friend')` expecting a friendship with
`primary-learner`, that friendship must be seeded. Name roles by their **story**
(`primary-learner`, `existing-friend`, `random-stranger`, `new-signup`), never
generically (`user`, `admin`).

- **Every role** referenced by any scene must exist in **every** team.
- **Each team is self-contained** — no actor (real user) appears in two teams.
- **Anonymous actors** (logged-out / signup flows) can have empty or partial
  credentials: `'visitor': { key: 'visitor' }`.

## N teams = N parallel scenes

Concurrency is team-based: each scene acquires **exclusive** use of one team, so
N teams run N scenes in parallel with no shared state or races. To add
concurrency, add more team files with different real users who have the **same**
relationships seeded (`pierre` is to `john` as `carlos` is to `maria`).

- **1 team** — scenes run sequentially. Fine to start.
- **2–3 teams** — good for most projects.
- **N teams** — match CI parallelism; more teams = more seed data to maintain.

A scene that needs specific roles waits for a team that provides them, so teams
may be heterogeneous — but keeping every team role-complete is simplest.

## Seeding auth state with `warmup`

`warmup` performs a login (or any setup) **once per actor at run start**, captures
the resulting `storageState` (cookies + localStorage), and reuses it for every
scene that actor appears in — so scenes start already authenticated instead of
logging in each time. Results are cached and deduplicated by the actor's `key`.

```ts
'primary-learner': {
  key: 'maria',
  email: 'maria@test.com',
  password: 'test123',
  // Function form — full control:
  warmup: async (page, actor) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(actor.email!)
    await page.getByLabel('Password').fill(actor.password!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
  },
  // Or the macro form — `warmup: 'login'` runs a named macro
  // (supports openTo, see, seeText, click, typeInto, wait; interpolates [self.field]).
},
```

For non-auth client state, `localStorage` is merged into each scene's context
(actor entries override warmup entries), letting you preset flags without a login.

## Per-scene DB state: `cleanup:` / `setup:`

Inside a `.spec.md`, directives before the actor cues run **server-side**
expressions (with the config `server` object in scope) to prepare and clean up
that scene's data. Execution order per scene: **`cleanup` (before) → `setup` →
scene steps → `cleanup` (after)**. The `[testStart]` token and `[role.key]`
interpolate into these expressions.

```scenetest
## learner creates a deck

cleanup: db.from('decks').delete().eq('uid', '[learner.key]')
setup:   db.from('decks').insert({ uid: '[learner.key]', name: 'starter' })

learner:
- openTo /decks
- see deck-[learner.key]
```

## Run-wide setup: config hooks

For setup that isn't per-scene, use the lifecycle hooks in `scenetest/config.ts`:

```ts
export default defineConfig({
  baseUrl: 'http://localhost:5173',
  beforeAll: async () => { /* migrate + seed the test DB */ },
  afterAll:  async () => { /* drop / reset */ },
  beforeEach: async (scene) => { /* scene.name, scene.file */ },
  afterEach:  async (scene, report) => { /* inspect report */ },
})
```

## `scenetest/config.ts` reference

`defineConfig({ … })`. Fields most relevant to teams, seeding, and scenes:

| Field | Purpose |
| --- | --- |
| `baseUrl` | App URL (required for the CLI). Actor `localStorage` seeds under this origin. |
| `server` | Object exposed to `serverCheck()` and `cleanup:`/`setup:` expressions. Type it with `declare module '@scenetest/checks' { interface ServerContext {…} }`. |
| `aliases` | Selector aliases (`~name` in scenes) → CSS/`aria-label`. |
| `consoleErrorAliases` | Named console errors for `expectConsoleError <name>` — `{ 'bad-password': 'Invalid login credentials' }` (value: substring or RegExp). |
| `errorSelectors` | `{ selector, message }[]` watched across all scenes; a match records a console error. |
| `consoleErrors` | `true`/`'error'`/`'warn'`/`false` — which console output to capture (default: errors). |
| `timeout` / `actionTimeout` / `warnAfter` | Scene timeout (30000), per-action timeout (5000), slow-action warning (500). |
| `browser` / `headed` / `devices` | `'chromium'\|'firefox'\|'webkit'`; visible browser; device rotation. |
| `builtinMacros` | `true` or a name list — enable built-in macros (`login`, `logout`, …). |
| `reportDir` / `reportFormat` | Where/how run reports are written (`'json'` default, `./scenetest/.reports`). |
| Hooks | `beforeAll` / `afterAll` / `beforeEach(scene)` / `afterEach(scene, report)`. |

## Checklist

- Every `actor('role')` referenced by a scene exists in **every** team.
- Every actor's credentials match a user in **seed data**; relationships are seeded.
- Each team is self-contained (no shared real users across teams).
- Roles are story-driven; anonymous actors only appear in no-login scenes.
- `key` is set, stable, and unique per real user.
- Auth-heavy suites use `warmup` so scenes start logged in.
- Per-scene data churn uses `cleanup:`/`setup:`; run-wide setup uses `beforeAll`.
