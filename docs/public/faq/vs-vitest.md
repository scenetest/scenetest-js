## How is this different from Vitest's in-source testing?

Vitest's in-source testing (`if (import.meta.vitest)`) lets you write unit tests alongside your code:

```typescript
// Vitest in-source
export function add(a, b) { return a + b }

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it('adds numbers', () => expect(add(1, 2)).toBe(3))
}
```

Scenecheck is different - it runs assertions in the real browser during app execution:

```tsx
// Scenecheck
function Cart({ items }) {
  should('cart has valid items', items.every(i => i.price > 0))
  return <div>...</div>
}
```

**Key differences:**

- **Runs in the real browser**, not Node.js or jsdom
- **Tests components in their actual context** with real state, real routing, real data
- **Assertions fire during normal usage**, not in a separate test runner
- **Production builds strip all Scenecheck code** - zero bundle impact

Think of it this way: Vitest in-source testing is for unit tests of pure functions. Scenecheck is for integration assertions that need the full browser environment and real app state.
