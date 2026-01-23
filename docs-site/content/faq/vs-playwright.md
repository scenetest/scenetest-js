## How is this different from Playwright's `page.evaluate()`?

Playwright's `page.evaluate()` lets you run code inside the browser, but it's designed for one-off evaluations, not for assertions that live in your components.

With Scenetest:
- **Assertions are co-located** with the code they test
- **Assertions run automatically** when components render
- **You see results in real-time** during development
- **No need to write separate spec files** for component-level behavior

Playwright is still great for orchestrating browser interactions (clicking, typing, navigating). Scenetest complements it by moving assertions closer to the code.
