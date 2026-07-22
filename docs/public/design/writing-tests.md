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

There are three ways to write spec files. All use the same [actor methods](/reference/text-dsl), the same [selector resolution](/reference/selectors), the same configuration, and the same team management. They differ in syntax and execution model.

| Style | File | Function | Best for |
|-------|------|----------|----------|
| **Markdown scenes** | `.spec.md` | Compiles to `scene()` | Simplest way to write a spec with as many actors as you want |
| **TypeScript scenes** | `.spec.ts` | `scene()` — reactive | When macros aren't enough: full TypeScript control over your scene spec |
| **Playwright specs** | `.spec.ts` | `test()` — sequential | Same async actor model you know from Cypress/Playwright |

Click the tabs to compare:

```ts [TypeScript scene]
import { scene } from '@scenetest/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  user.openTo('/')
  user.see('welcome-box')
  user.click('continue-button')
  user.see('onboarding-step')
})
```

```scenetest [Markdown scene]
# user completes onboarding
new-user:
- openTo /
- see welcome-box
- click continue-button
- see onboarding-step
```

```ts [Playwright spec]
import { test } from '@scenetest/scenes'

test('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')
  await user.openTo('/')
  await user.see('welcome-box')
  await user.click('continue-button')
  await user.see('onboarding-step')
})
```

For the full comparison between the two TypeScript models — how to tell them apart, multi-actor concurrency, coordination, conditional monitors, and action chains vs reactive actors — see the [TypeScript Scenes & Playwright Specs reference](/reference/concurrent-and-classic).

For the complete `.spec.md` format rules, interpolation, cleanup/setup directives, and macros — see the [Markdown Spec Reference](/reference/text-dsl).

> **STATUS:** Both `scene()` and `test()` execution models are implemented. `.spec.md` files compile to `scene()`.

---

## Writing Inline Assertions

```tsx
// components/ProfileForm.tsx
import { should, failed } from '@scenetest/checks/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

`should()`'s condition can be a boolean **or a `() => boolean` predicate**. Prefer
the predicate form when the check involves real work — it keeps the computation
inline and strips from production along with the assertion, instead of hoisting it
into a variable that runs even after stripping:

```tsx
// Avoid: runs in production even though the should() call is stripped
const results = expensiveSearch(query)
should('search returns results', results.length > 0)

// Prefer: the computation only runs when the assertion runs
should('search returns results', () => expensiveSearch(query).length > 0)
```

For the full guide on `should()`, `failed()`, multi-context `serverCheck()`, framework imports, and best practices, see [Writing Inline Assertions](/guides/writing-inline-assertions).

---

## Actor DSL Methods

For the complete method reference (navigation, visibility, interaction, scope navigation, conditionals, utilities), see the [Markdown Spec Reference](/reference/text-dsl) and the [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic) page.

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
  // Name the console errors scenes deliberately trigger, so specs can
  // claim them by domain term: `expectConsoleError bad-password`.
  consoleErrorAliases: {
    'bad-password': 'Invalid login credentials',
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
