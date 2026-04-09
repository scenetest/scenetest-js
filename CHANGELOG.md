# Changelog

All notable changes to Scenetest are documented here.

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
