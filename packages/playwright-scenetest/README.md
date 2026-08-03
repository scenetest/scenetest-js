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

## The `scenePage` fixture

`scenePage` wraps Playwright's `page`. It calls `page.exposeFunction('__scenetest_report')` so the browser hands each assertion result back to the test process as it fires.

It adds four members to `page`:

- `assertions` — every assertion result the page reported, in order
- `passed` — the results that passed
- `failed` — the results that failed
- `waitForAssertions(timeout)` — polls until no `serverCheck()` RPC calls are pending

If a test ends with failed assertions, the fixture logs them, so you see which check failed without adding your own reporting.

See the [monorepo](https://github.com/scenetest/scenetest-js) for full documentation.
