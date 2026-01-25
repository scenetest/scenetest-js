<div align="center">

# Scenetest

</div>

_Evaluate your product, not your tests. A Javascript testing framework with inline assertions and scene-based browser orchestration._

---

## Installation

```bash
# For React apps
pnpm add @scenetest/react @scenetest/vite-plugin @scenetest/cli

# For Vue apps
pnpm add @scenetest/vue @scenetest/vite-plugin @scenetest/cli

# For Solid apps
pnpm add @scenetest/solid @scenetest/vite-plugin @scenetest/cli

# For Svelte apps
pnpm add @scenetest/svelte @scenetest/vite-plugin @scenetest/cli
```

## Quick Start

**1. Add the Vite plugin:**

```typescript
// vite.config.ts
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [react(), scenetest()],
})
```

**2. Write inline assertions in components:**

```tsx
import { should, failed } from '@scenetest/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

**3. Write scene specs:**

```typescript
// scenes/profile.spec.ts
import { scene } from '@scenetest/cli'

scene('user can update their name', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/')
  await user
    .see('name-input')
    .typeInto('name-input', 'New Name')
    .click('submit-button')
  await user.seeText('New Name')
})
```

**4. Run tests:**

```bash
pnpm scenetest
```

## Documentation

**Guides**
- [Writing Scene Specs](./docs/public/guides/writing-scene-specs.md)
- [Writing Inline Assertions](./docs/public/guides/writing-inline-assertions.md)
- [Using AI to Write Specs](./docs/public/guides/llm-prompt.md)

**FAQ**
[Comparing to Playwright](./docs/public/faq/vs-playwright.md)
[Comparing to Vitest](./docs/public/faq/vs-vitest.md)
[Comparing to Cypress](./docs/public/faq/vs-cypress.md)
[Note on Security](./docs/public/faq/security.md)

**Design Docs**
- [Actors API Design Document](./docs/design/actors-api.md)
- [CLI Design Document](./docs/design/cli-v2.md)
- [Server Actions Design Document](./docs/design/server-actions.md)
- [Reporting System Design Document](./docs/design/dashboard.md)

## Packages

| Package | Description |
|---------|-------------|
| `@scenetest/vite-plugin` | Vite plugin for production stripping and dev panel |
| `@scenetest/cli` | CLI runner for scene specs |
| `@scenetest/core` | Core `should()`, `failed()`, `assert()` functions |
| `@scenetest/react` | React bindings with `useTestEffect` hook |
| `@scenetest/vue` | Vue bindings with `watchTestEffect` composable |
| `@scenetest/solid` | Solid bindings with `createTestEffect` primitive |
| `@scenetest/svelte` | Svelte bindings with `testEffect` helper |

## FAQ

### Is it safe to run scenetest in production?

Mmmm, the short answer is "No." Scenetest's Vite plugin strips all the server
assertions from the production bundle without deploying them to the server, and it doesn't inject the observer or serve the middleware that powers the collector -- and we do have (some) tests in place for this. And server assertions never have a return value anyway so data access is less of a concern.

So the attack surface is pretty small, but a security audit has not been done. Further the data collection doesn't proactively filter out
things like personal data and passwords so it is best used on sample or seed data rather than in production systems.

In the future it might be nice to evolve Scenetest into a production tool for event analytics, observalibility, etc., but for now: it only runs on the dev server 😇

## License

MIT
