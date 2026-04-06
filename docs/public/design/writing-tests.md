# Writing Tests with Scenetest

> **For humans and language models writing scenetest specs in application repos.**
> This is the test-authoring reference. For contributing to scenetest itself, see the repo's CLAUDE.md.

---

## How Scenetest Works

Scenetest separates two concerns that traditional E2E frameworks conflate:

1. **Scenes** — Orchestration scripts that simulate user journeys (login, fill form, click submit). Written in spec files. The person writing scenes doesn't need to know implementation details.
2. **Inline Assertions** — `should()` and `failed()` calls placed directly in application code (components, hooks, callbacks). They run every time that code executes, whether triggered by a scene, the dev panel, or a human clicking around.

Scenes test **user journeys**. Inline assertions test **the developer's mental model** of how the system works. These are different things and benefit from being authored by different people in different places.

### What to put where

| Concern | Where it goes | Who writes it | Example |
|---------|--------------|---------------|---------|
| "User can log in and update their profile" | Scene spec file (`scenes/*.spec.ts` or `scenes/*.spec.md`) | QA, PM, or developer | `user.openTo('/login')` ... `user.click('submit')` |
| "Profile data should be loaded before render" | Inline assertion in component | Component author | `should('profile loaded', profile !== undefined)` |
| "Form should not submit with empty name" | Inline assertion in submit handler | Feature developer | `failed('empty name submitted', { name })` |
| "After mutation, cache matches server" | Multi-context assertion (future) | Feature developer | `serverCheck({ title: '...', serverFn, withData })` |

---

## Authoring Models

There are three ways to write spec files. All use the same [actor DSL methods](/reference/actor-api), the same [selector resolution](/reference/selectors), the same configuration, and the same team management. They differ in syntax and execution model.

| Style | File | Function | Best for |
|-------|------|----------|----------|
| **Text DSL (md)** | `.spec.md` | Compiles to `scene()` | Simplest way to write a concurrent spec with as many actors as you want |
| **Concurrent (ts)** | `.spec.ts` | `scene()` — reactive concurrent | When macros aren't enough: full TypeScript control over your scene spec |
| **Classic Driver (ts)** | `.spec.ts` | `test()` — sequential | Same async actor model you know from Cypress/Playwright |

Click the tabs to compare:

```ts [Concurrent (ts)]
import { scene } from '@scenetest/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  user.openTo('/')
  user.see('welcome-box')
  user.click('continue-button')
  user.see('onboarding-step')
})
```

```scenetest [Text DSL (md)]
# user completes onboarding
new-user:
- openTo /
- see welcome-box
- click continue-button
- see onboarding-step
```

```ts [Classic Driver (ts)]
import { test } from '@scenetest/scenes'

test('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')
  await user.openTo('/')
  await user.see('welcome-box')
  await user.click('continue-button')
  await user.see('onboarding-step')
})
```

For the full comparison between the two TypeScript models — how to tell them apart, multi-actor concurrency, coordination, conditional monitors, and action chains vs reactive actors — see the [Concurrent and Classic Mode reference](/reference/concurrent-and-classic).

For the complete `.spec.md` format rules, interpolation, macros, and `dsl()` method — see the [Text DSL Format reference](/reference/text-dsl).

> **v0.4.0 additions:** Markdown scenes now support `setup:` directives for per-scene state seeding (runs after pre-cleanup, before scene steps), multiple `cleanup:`/`setup:` lines per scene, `[team.field]` interpolation from team `tags` metadata in cleanup/setup expressions, `[testStart]` timestamp tokens, and the `pressKey <key>` action for raw keyboard events.

> **STATUS:** Both `scene()` (concurrent) and `test()` (classic driver) execution models are implemented. We are evaluating which to keep long-term. See [Concurrent vs Classic — Two Execution Models](/design/scene-vs-flow) for the trade-off analysis. Before 1.0, one will be removed. Text DSL `.spec.md` files compile to `scene()`.

---

## Writing Inline Assertions

```tsx
// components/ProfileForm.tsx
import { should, failed } from '@scenetest/checks-react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

For the full guide on `should()`, `failed()`, multi-context `serverCheck()`, framework imports, and best practices, see [Writing Inline Assertions](/guides/writing-inline-assertions).

---

## Actor DSL Methods

For the complete method reference (navigation, visibility, interaction, scope navigation, conditionals, utilities), see the [Actor API Reference](/reference/actor-api).

## Selector Resolution

For the full selector syntax — attribute matching, nested selectors, key selectors, sigils, and aliases — see the [Selectors reference](/reference/selectors). For guidance on which attributes to use (`data-testid` vs. `aria-label` vs. `data-name` + `data-key`), see [Choosing the Right Attribute](/guides/writing-scene-specs#choosing-the-right-attribute).

---

## Configuration

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  browser: 'chromium',
  headed: false,
  timeout: 30000,
  actionTimeout: 5000,
  warnAfter: 500,
  aliases: {
    modal: '[role=dialog]',
    nav: '[role=navigation]',
  },
  reportDir: './scenetest-reports',
  reportFormat: 'html',

  // Keyboard navigation (ON by default — actors rotate pointer/keyboard)
  // noKeyboardActor: true,   // Uncomment to disable

  // Fuzzy-finger touch simulation (OFF by default)
  // fuzzyFingers: true,      // Uncomment to enable imprecise touch (~1 in 5 clicks miss)
})
```

For the full configuration reference including hooks, timing, and reporting, see [CLI v2 Design](/design/cli-v2#9-configuration-reference).

### Actor teams

Define actor credentials in `scenetest/actors/` (one `.ts` file per team). Teams enable parallel scene execution — each scene acquires a team, so scenes using different teams run concurrently without data conflicts.

For the full guide on team design, seed data, and scaling concurrency, see [Building Good Teams of Actors](/guides/building-teams).
