# @scenetest/playwright

Playwright fixtures for [Scenetest](https://github.com/scenetest/scenetest-js) inline assertions. Provides a `scenePage` fixture that collects assertion results from the browser.

```bash
npm install -D @scenetest/playwright
```

```js
import { test } from '@scenetest/playwright'

test('loads without failures', async ({ scenePage }) => {
  await scenePage.goto('/')
  await scenePage.waitForAssertions()
  expect(scenePage.failed).toHaveLength(0)
})
```

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
