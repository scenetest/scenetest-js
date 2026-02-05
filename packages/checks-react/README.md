# @scenetest/checks-react

React bindings for [Scenetest](https://github.com/scenetest/scenetest-js) inline assertions.

```bash
npm install @scenetest/checks-react
```

```jsx
import { useCheck } from '@scenetest/checks-react'

function Cart({ items }) {
  useCheck('cart has items', () => items.length > 0)
  return <div>...</div>
}
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
