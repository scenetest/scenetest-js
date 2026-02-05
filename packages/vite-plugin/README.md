# @scenetest/vite-plugin

Vite plugin for [Scenetest](https://github.com/scenetest/scenetest-js). Injects the dev panel during development and strips all assertion code from production builds.

```bash
npm install -D @scenetest/vite-plugin
```

```js
// vite.config.ts
import { scenetest } from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [scenetest()],
})
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
