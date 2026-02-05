# @scenetest/checks-solid

Solid bindings for [Scenetest](https://github.com/scenetest/scenetest-js) inline assertions.

```bash
npm install @scenetest/checks-solid
```

```jsx
import { createCheck } from '@scenetest/checks-solid'

function Cart(props) {
  createCheck('cart has items', () => props.items.length > 0)
  return <div>...</div>
}
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
