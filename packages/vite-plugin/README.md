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

## Security Considerations

`serverCheck()` server functions are extracted at build time and executed by the dev-server middleware (`POST /__scenetest/run`) with full Node.js privileges. That code is yours, and it only ever runs on infrastructure you control: your own Vite dev server, whether that's your laptop or a disposable runner box you provision. It is never executed in any cloud worker or other hosted service. Don't expose the dev server to untrusted networks or code.

Each `serverCheck()` invocation is subject to a per-check timeout (default 5000ms, configurable via the plugin's `serverCheckTimeout` option); a check that exceeds it is reported as a failed assertion and the RPC response still returns.

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
