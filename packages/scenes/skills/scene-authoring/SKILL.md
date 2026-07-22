---
name: scene-authoring
description: >-
  Use when writing, reviewing, or generating Scenetest scene specs — the
  orchestration scripts that simulate user journeys (open a page, fill a form,
  click, assert what's on screen) with one or more concurrent actors. Covers the
  three authoring models (`.spec.md` markdown, `scene()` reactive TypeScript,
  and `test()` classic await-driven), the full actor DSL (navigation,
  observation, scope, interaction, coordination, conditionals), selector
  resolution and aliases, multi-actor coordination with emit/waitFor,
  `expectConsoleError` for deliberate error paths, and the `.spec.md` format
  (interpolation, cleanup/setup, macros). Apply whenever a task adds or edits
  files under `scenetest/scenes/` (`*.spec.md` or `*.spec.ts`). For actor teams
  and seed data, see the team-configuration skill; for `should()`/`failed()`
  inside app code, see @scenetest/checks#inline-assertions.
---

# Writing Scenetest Scenes

A **scene** orchestrates a user journey through the app under test: it drives one
or more **actors** (each a real browser context) to navigate, interact, and
observe. Scenes live in `scenetest/scenes/**/*.spec.md` or `**/*.spec.ts` and are
run by the `scenetest` CLI. They test *journeys*; `should()`/`failed()` inside
app code test *internal invariants* (a separate skill).

Actors are referenced by **role name** (`actor('learner')`), resolved from the
configured teams — see the team-configuration skill. Roles are story-driven
(`primary-learner`, `existing-friend`), never generic (`user`).

## Three authoring models

All three share the same DSL, selectors, config, and teams — they differ only in
syntax and execution model.

| Model | File | Entry | Execution |
| --- | --- | --- | --- |
| **Markdown** | `.spec.md` | compiles to `scene()` | reactive, concurrent |
| **TypeScript scene** | `.spec.ts` | `scene()` | reactive, concurrent — **not awaited** |
| **Playwright spec** | `.spec.ts` | `test()` | classic — **`await` every step** |

```ts
// scene() — reactive. Calls QUEUE actions; the runner drains all actors
// concurrently. actor() is synchronous, DSL calls are NOT awaited.
import { scene } from '@scenetest/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  user.openTo('/').see('welcome-box').click('continue-button')
  user.see('onboarding-step')
})
```

```ts
// test() — classic. actor() is awaited; every step is awaited, top to bottom.
import { test } from '@scenetest/scenes'

test('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')
  await user.openTo('/')
  await user.see('welcome-box').click('continue-button')
  await user.see('onboarding-step')
})
```

```scenetest
# user completes onboarding
new-user:
- openTo /
- see welcome-box
- click continue-button
- see onboarding-step
```

**Pick markdown by default** — it's the simplest way to write a multi-actor spec.
Use `scene()` when you need TypeScript (loops, computed values). Use `test()`
when you want the familiar sequential `await` model.

## Actor DSL

Methods are chainable. The same set is available in all three models (in the text
DSL, the method name is the verb and its arguments follow).

**Navigation** — reset scope to page root:
- `openTo(url)` — navigate to a URL
- `reload()` / `goBack()` / `goForward()` — history
- `switchDevice(name?)` — new browser context with different device emulation (drops cookies/localStorage; tests server-state pickup)

**Observation** — assert only, never change scope:
- `see(selector)` — wait for element visible (falls back to page root)
- `seeInView(selector)` — visible **and** in the viewport (no scroll)
- `notSee(selector)` — wait for element hidden/detached
- `seeText(text)` — wait for text visible
- `seeToast(selector)` — wait for element to appear **then disappear** (toasts)
- `expectConsoleError(pattern)` — assert an expected console error (see below)

**Scope** — narrow where selectors resolve:
- `scope(selector)` — wait for element and set it as the current scope
- `up(selector?)` — widen: bare `up` → page root, `up <selector>` → matching ancestor
- `prev()` — pop back to the previous scope

**Interaction** — resolve within the current scope (strict — no root fallback):
- `click(selector?)` — bare `click` clicks the current scope
- `ifClick(selector)` — click if visible, else skip silently
- `typeInto(selector, value)` — fill an input (replaces content)
- `check(selector)` — check a checkbox
- `select(selector, value)` — choose a dropdown option
- `pressKey(key)` — raw keyboard event (Playwright key name: `Escape`, `Enter`, `Tab`)

**Coordination & control:**
- `emit(message)` — publish a message on the shared bus (sticky)
- `waitFor(message)` — block this actor until the message arrives
- `wait(ms)` — fixed delay (prefer `see`/`waitFor` over `wait`)
- `warnIf(selector, message)` — record a script warning if the selector appears
- `scrollToBottom()` — scroll the current scope to the bottom

**TypeScript-only** (`scene()` / `test()`, not the text DSL):
- `do(async (page) => { … })` — run arbitrary Playwright code inline in the queue
- `if(selector, actor => { … })` — run sub-actions only if the selector is present
- `dsl(text)` — parse and queue a multiline text-DSL string

### Scope, briefly

`see` checks visibility but leaves scope alone; `scope` narrows it. `click`,
`typeInto`, etc. resolve **strictly** within the current scope — if nothing
matches you get a diagnostic naming the action, selector, and scope, not a silent
pass. Widen with `up`/`prev` to reach outside the current scope.

## Selectors

A bare token resolves against these attributes, in order:
`aria-label` → `id` → `data-testid` → `data-name` → `data-key` → `name`.

- **Nested:** space-separated tokens descend — `modal search-input` = `search-input` within `modal`.
- **Key selector:** `['playlist-row', '12345']` (JSON in the text DSL) targets a `data-key`.
- **`@label`** — force an exact `aria-label` match: `@Confirm`.
- **`~name`** — a selector alias defined in config's `aliases` map: `~modal`.
- **Nth match:** append `#1`/`#2`/… to disambiguate when several elements match in scope.

Prefer `aria-label` for interactive elements (accessible **and** a stable selector).

## Multi-actor coordination

Actors run concurrently. Synchronize them with `emit`/`waitFor` on the shared
message bus — messages are sticky, so order between actors doesn't matter:

```scenetest
## sender and receiver exchange a message

sender:
- openTo /compose
- typeInto body Hello!
- click send
- emit message-sent

receiver:
- waitFor message-sent
- openTo /inbox
- seeText New message
```

In `.spec.md`, each `role:` block under a `##` scene declares that actor's
timeline; blocks run concurrently and re-referencing a role continues its script.

## Expecting console errors

When a scene deliberately triggers an error (wrong-password login, invalid
submit), the server *should* return an error — and Scenetest would otherwise flag
the resulting console error as a problem. `expectConsoleError(pattern)` declares
it a success: it waits (up to the action timeout) for a captured browser console
error / uncaught exception matching `pattern`, marks it **expected**, and **fails
the scene if none appears**.

```scenetest
learner:
- typeInto password wrong-password
- click sign-in
- expectConsoleError bad-password        # a config alias (recommended)
- expectConsoleError /status of 4\d\d/   # or a /regex/
- seeText Wrong email or password
```

- `pattern` is a **case-insensitive substring**, a `/regex/` (text DSL) or a
  `RegExp` (TypeScript), or the name of a `consoleErrorAliases` entry from config
  (`~name` forces alias resolution and throws on a typo).
- Each call claims **one** error (the earliest unclaimed match for that actor), so
  add one line per console message a failure emits — a failed request that logs
  both a resource error and an uncaught exception needs two.

Expected errors report as `✓ N expected console error(s)`, kept out of the
`🔴 browser console error(s)` surface. Define aliases once in config — see the
team-configuration skill.

## `.spec.md` format

- `#` heading → **scene group**; `##` heading → **scene name**. (A single-level
  file where each `#`/`##` is a scene also works.)
- `role:` on its own line opens that actor's block; actions follow as `- ` list
  items (ordered `1.` lists and bare lines work too). `role: openTo /` puts the
  first action inline.
- `//` lines are comments (they echo into the run log). Note `#`/`##` are
  **headings**, not comments.
- **Interpolation:** `[role.field]` injects an actor's config field —
  `typeInto email [learner.email]`, `see deck-[learner.key]`. `[self.field]`
  refers to the current actor (inside a macro), `[team.field]` to team metadata.
- **`cleanup:` / `setup:`** directives (before the actor cues) run DB
  setup/teardown for that scene — see the team-configuration skill.
- **Macros:** any first word that isn't a known verb is a macro call, e.g.
  `login() [learner.email] [learner.password]`. Define macros in a `.ts` file
  with `defineMacro('login', ['openTo /login', 'typeInto email [self.email]', …])`.
  Built-ins (`login`, `logout`, `accept-cookies`, `refresh-and-retry`) are
  enabled with `builtinMacros: true` in config.

```scenetest
## learner reviews a deck

cleanup: db.from('reviews').delete().eq('uid', '[learner.key]')

learner:
- login() [learner.email] [learner.password]
- openTo /decks
- click deck-[learner.key]
- see ~modal review-panel
- seeToast saved
```

## Best practices

- **Wait on state, not time.** Prefer `see` / `seeText` / `waitFor` over `wait <ms>`.
- **Assert what the user perceives** — `seeText`, `see`, `seeToast` — not internals.
- **Name roles by story**, and only reference roles your teams actually provide.
- **`scope` before a burst** of actions inside one container; `prev`/`up` to leave.
- **Deliberate error paths** use `expectConsoleError`, not a bare console error.
- **Coordinate** cross-actor ordering with `emit`/`waitFor`, never `wait`.

## Quick reference

| Category | Verbs |
| --- | --- |
| Navigation | `openTo` `reload` `goBack` `goForward` `switchDevice` |
| Observation | `see` `seeInView` `notSee` `seeText` `seeToast` `expectConsoleError` |
| Scope | `scope` `up` `prev` |
| Interaction | `click` `ifClick` `typeInto` `check` `select` `pressKey` |
| Coordination | `emit` `waitFor` `wait` `warnIf` `scrollToBottom` |
| Code-only | `do(fn)` `if(sel, cb)` `dsl(text)` |
