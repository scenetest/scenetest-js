## How is this different from Playwright's `page.evaluate()`?

Playwright's `page.evaluate()` lets you run code inside the browser from your test file:

```typescript
// Playwright
const count = await page.evaluate(() => document.querySelectorAll('.item').length)
expect(count).toBe(5)
```

Scenetest flips this relationship. Instead of reaching into the browser from tests, you write assertions directly in your components:

```tsx
// Scenetest - inline assertion
function ItemList({ items }) {
  should('should have items', items.length > 0)
  return <ul>{items.map(i => <li>{i.name}</li>)}</ul>
}
```

And you use scene specs to orchestrate user journeys:

```typescript
// Scenetest - scene spec
test('user sees items', async ({ actor }) => {
  const user = await actor('user')
  await user.openTo('/items')
  await user.see('item-list')
})
```

**Key differences:**

- **Inline assertions** run every render, catching regressions immediately
- **Full access to framework state** - no DOM querying needed
- **Scene specs** use actors (`actor()`) instead of raw Playwright APIs — write `test()` for familiar async style or `scene()` for declarative concurrency
- **Real-time observer** shows assertions as you develop

Scenetest is inspired by `page.evaluate` but takes the "code in browser" idea further.
