# How is this different from Cypress component testing?

Cypress component testing mounts components in isolation with mocked dependencies:

```typescript
// Cypress component test
import { mount } from 'cypress/react'
import Cart from './Cart'

it('shows items', () => {
  mount(<Cart items={[{ name: 'Test', price: 10 }]} />)
  cy.get('[data-testid="item"]').should('have.length', 1)
})
```

Scenetest takes a different approach - assertions live inside your components and run in your actual app:

```tsx
// Scenetest
function Cart({ items }) {
  should('cart has items', items.length > 0)
  should('all prices valid', items.every(i => i.price > 0))

  return <div data-testid="cart">...</div>
}
```

**Key differences:**

- **Components run in your actual app**, not mounted in isolation
- **No mocking required** - use your real data, real routing, real state management
- **Assertions live in the component**, verified every render
- **See assertions during development** in the observer panel, not just in CI
- **Scene specs** orchestrate full user journeys, not isolated interactions

Cypress is excellent for isolated component testing. Scenetest is for testing components as they actually run in your application, with all their real dependencies.
