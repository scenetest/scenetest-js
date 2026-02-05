# @scenetest/checks-vue

Vue bindings for [Scenetest](https://github.com/scenetest/scenetest-js) inline assertions.

```bash
npm install @scenetest/checks-vue
```

```vue
<script setup>
import { watchCheck } from '@scenetest/checks-vue'

watchCheck('cart has items', () => items.value.length > 0)
</script>
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
