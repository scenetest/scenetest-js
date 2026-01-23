## How is this different from Cypress component testing?

Cypress component testing mounts components in isolation with mocked dependencies. Scenetest takes a different approach:

- **Components run in your actual app**, not in isolation
- **No mocking required** - use your real data, real routing, real state management
- **Assertions live in the component**, not in a separate test file
- **See assertions during development**, not just in CI

Cypress is excellent for isolated component testing. Scenetest is for testing components as they actually run in your application, with all their real dependencies.
