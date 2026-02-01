<div align="center">

# Scenetest

</div>

_Evaluate your product, not your tests. A Javascript testing framework with inline assertions and scene-based browser orchestration._

---

## Installation

```bash
# For React apps
pnpm add @scenetest/checks-react @scenetest/vite-plugin @scenetest/scenes

# For Vue apps
pnpm add @scenetest/checks-vue @scenetest/vite-plugin @scenetest/scenes

# For Solid apps
pnpm add @scenetest/checks-solid @scenetest/vite-plugin @scenetest/scenes

# For Svelte apps
pnpm add @scenetest/checks-svelte @scenetest/vite-plugin @scenetest/scenes
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
import { should, failed } from '@scenetest/checks-react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}
```

**3. Write scene specs:**

Choose your style — TypeScript or plain markdown:

```typescript
// scenes/profile.spec.ts
import { flow } from '@scenetest/scenes'

flow('user can update their name', ({ actor }) => {
  const user = actor('user')

  user.openTo('/')
  user
    .see('name-input')
    .typeInto('name-input', 'New Name')
    .click('submit-button')
  user.seeText('New Name')
})
```

Or write specs as **human-readable markdown** — GitHub-renderable and executable:

```markdown
<!-- scenes/profile.spec.md -->
# user can update their name
user:
- openTo /
- see name-input
- typeInto name-input New Name
- click submit-button
- seeText New Name
```

**4. Run tests:**

```bash
pnpm scenetest
```

## Documentation

**Guides**
- [Writing Scene Specs](./docs/public/guides/writing-scene-specs.md) — three styles: declarative (ts), text DSL (md), classic driver (ts)
- [Writing Inline Assertions](./docs/public/guides/writing-inline-assertions.md)
- [Building Good Teams of Actors](./docs/public/guides/building-teams.md)

**Reference**
- [Actor API Reference](./docs/public/reference/actor-api.md) — complete method list and selector resolution
- [Writing Tests (Design Reference)](./docs/public/design/writing-tests.md) — both execution models, full DSL reference, macros

**FAQ**
- [Comparing to Playwright](./docs/public/faq/vs-playwright.md)
- [Comparing to Vitest](./docs/public/faq/vs-vitest.md)
- [Comparing to Cypress](./docs/public/faq/vs-cypress.md)
- [Note on Security](./docs/public/faq/security.md)

**Design Docs**
- [Declarative Flow vs Classic Driver](./docs/public/design/scene-vs-flow.md) — execution model comparison and decision criteria
- [Actors API Design](./docs/public/design/actors-api.md)
- [CLI Design](./docs/public/design/cli-v2.md) — text DSL grammar, selector resolution, warnings
- [Server Actions Design](./docs/public/design/server-actions.md)
- [Reporting System Design](./docs/public/design/dashboard.md)

## Packages

| Package | Description |
|---------|-------------|
| `@scenetest/vite-plugin` | Vite plugin for production stripping and dev panel |
| `@scenetest/scenes` | CLI runner for scene specs |
| `@scenetest/checks` | Core `should()`, `failed()`, `serverCheck()` functions |
| `@scenetest/checks-react` | React bindings with `useCheck` hook |
| `@scenetest/checks-vue` | Vue bindings with `watchCheck` composable |
| `@scenetest/checks-solid` | Solid bindings with `createCheck` primitive |
| `@scenetest/checks-svelte` | Svelte bindings with `checkEffect` helper |

## FAQ

### Is it safe to run scenetest in production?

Mmmm, the short answer is "No." Scenetest's Vite plugin strips all the server
assertions from the production bundle without deploying them to the server, and it doesn't inject the observer or serve the middleware that powers the collector -- and we do have (some) tests in place for this. And server assertions never have a return value anyway so data access is less of a concern.

So the attack surface is pretty small, but a security audit has not been done. Further the data collection doesn't proactively filter out
things like personal data and passwords so it is best used on sample or seed data rather than in production systems.

In the future it might be nice to evolve Scenetest into a production tool for event analytics, observalibility, etc., but for now: it only runs on the dev server 😇

## License

MIT
