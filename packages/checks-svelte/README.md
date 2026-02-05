# @scenetest/checks-svelte

Svelte bindings for [Scenetest](https://github.com/scenetest/scenetest-js) inline assertions.

```bash
npm install @scenetest/checks-svelte
```

```svelte
<script>
import { checkEffect } from '@scenetest/checks-svelte'

checkEffect('cart has items', () => items.length > 0)
</script>
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
