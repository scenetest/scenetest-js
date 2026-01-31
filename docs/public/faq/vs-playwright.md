## How is `serverCheck()` different from Playwright's `page.evaluate()`?

We should start by saying Playwright is fantastic technology and its browser drivers and headless
context management power Scenecheck-JS at the very last mile!

Second, our `serverCheck` was inspired
directly by the usefulness of Playwright's `page.evaluate()`, which lets you run your tests on your
server, but make assertions about data that has to be gathered from inside the specific agent's
browser context, DOM, etc.

```typescript
// Playwright
const count = await page.evaluate(() => document.querySelectorAll('.item').length)
const dbCount = await orm.get('items').count()
expect(count).toBe(dbCount)
```

Scenecheck flips this relationship. Instead of reaching into the browser from the tests outside,
you write assertions directly in your components, including these `serverCheck` calls:

```tsx
// Scenecheck - inline assertion "should", and server action "serverCheck"
function ItemList({ items }) {
  should('should have items', items.length > 0)
  // In react you would wrap this in an effect
  serverCheck(
    'check items after transaction',
    async (server, data) => {
      const serverCount = await server.orm
        .get('items').eq('userId', data.user.id).count()
      should(
        'item counts match in state and on server',
        serverCount === data.length
      )
	 }
  ),

  return <ul>{items.map(i => <li>{i.name}</li>)}</ul>
}
```

And you use scene specs to orchestrate user journeys:


```ts [classic.spec.ts]
// Classic driver, 'test' function
test('user sees items', async ({ actor }) => {
  const user = await actor('user')
  await user.openTo('/items')
  await user.see('item-list')
})
```
```ts [Concurrent style]
// Concurrent 'scene'
scene('user sees items', ({ actor }) => {
  const user = actor('user-main-1')
  user.openTo('/items')
      .see('item-list')
})
```
```markdown [Markdown style]
# user sees items
user-main-1:
- openTo /items
- see item-list
```

**Key differences:**

- **Inline assertions** run every render, catching regressions immediately
- **Full access to framework state** - no DOM querying needed
- **Scene specs** use actors (`actor()`) instead of raw Playwright APIs — write `test()` for familiar async style or `scene()` for concurrent draining
- **Real-time observer** shows assertions as you develop

Scenecheck is inspired by `page.evaluate` but takes the "code in browser" idea further.
