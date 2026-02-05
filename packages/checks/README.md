# @scenetest/checks

Inline assertions for end-to-end testing. The core assertion library for [Scenetest](https://github.com/scenetest/scenetest-js).

```bash
npm install @scenetest/checks
```

```js
import { should, failed, match } from '@scenetest/checks'

should('item appears in cart', () => cartItems.length > 0)
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
