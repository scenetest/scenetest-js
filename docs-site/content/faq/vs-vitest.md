## How is this different from Vitest's in-source testing?

Vitest's in-source testing (`if (import.meta.vitest)`) lets you write unit tests alongside your code. That's great for testing pure functions!

Scenetest is different:
- **Runs in the real browser**, not a simulated environment
- **Tests components in their actual context** with real state, real styling, real user interactions
- **Assertions execute during normal app usage**, not in a separate test run
- **Production builds strip all Scenetest code**, so there's no bundle size impact

Think of it this way: Vitest in-source testing is for unit tests, Scenetest is for integration/e2e assertions that need the full browser environment.
