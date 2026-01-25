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

scene('user can update their name', async ({ cast }) => {
  const user = await cast('user')

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

- [Writing Scene Specs](./docs-site/public/content/guides/writing-scene-specs.md)
- [Using AI to Write Specs](./docs-site/public/content/guides/llm-prompt.md)
- [CLI Design Document](./packages/scenetest-cli/DESIGN.md)

## Packages

| Package | Description |
|---------|-------------|
| `@scenetest/core` | Core `should()`, `failed()`, `assert()` functions |
| `@scenetest/react` | React bindings with `useTestEffect` hook |
| `@scenetest/vue` | Vue bindings with `watchTestEffect` composable |
| `@scenetest/solid` | Solid bindings with `createTestEffect` primitive |
| `@scenetest/svelte` | Svelte bindings with `testEffect` helper |
| `@scenetest/vite-plugin` | Vite plugin for dev panel and production stripping |
| `@scenetest/cli` | CLI runner for scene specs |

## License

MIT
