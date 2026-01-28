## What's the difference between Concurrent and Classic?

Scenetest offers two ways to write scene specs: the **Concurrent** model (`scene()`) and the **Classic Driver** model (`test()`). They both orchestrate browser interactions through actors, but they work quite differently under the hood.

### The Classic Driver came first

When we started building Scenetest, we began with what everyone knows: the async/await pattern from Playwright and Cypress. You `await` each action, control the timeline yourself, and chain operations sequentially.

```ts
test('user completes checkout', async ({ actor }) => {
  const user = await actor('user')
  await user.openTo('/cart')
  await user.see('cart-items')
  await user.click('checkout-button')
})
```

This works great for single-user flows. But we really wanted to focus on **multi-actor scenes** — coordinating multiple users interacting with your app simultaneously.

### The message bus changed everything

To coordinate actors, we built a message bus with `emit()` and `waitFor()`. But managing multiple async timelines with `Promise.all` and manual synchronization was painful:

```ts
// This gets messy fast
await Promise.all([
  (async () => {
    await alice.openTo('/search')
    await alice.typeInto('search', bob.username)
    await alice.click('send-request')
    messageBus.emit('request-sent')
  })(),
  (async () => {
    await messageBus.waitFor('request-sent')
    await bob.openTo('/notifications')
    await bob.click('accept')
  })()
])
```

### Concurrent drain was born

So we tried something different: what if actions just **queue up** per actor, and we drain all the queues concurrently when the function returns? No async/await, no `Promise.all`, no race conditions to think about:

```ts
scene('friend request flow', ({ actor }) => {
  const alice = actor('alice')
  const bob = actor('bob')

  alice.openTo('/search')
       .typeInto('search', bob.username)
       .click('send-request')
       .emit('request-sent')

  bob.waitFor('request-sent')
     .openTo('/notifications')
     .click('accept')
})
```

The concurrent model made specs so simple that **anyone could write them** — not just engineers who understand async JavaScript. This gave rise to the text DSL:

```markdown
# friend request flow
alice:
- openTo /search
- typeInto search [bob.username]
- click send-request
- emit request-sent

bob:
- waitFor request-sent
- openTo /notifications
- click accept
```

### Why keep both?

We wanted to make it easier for people to try Scenetest's other benefits — the selector logic, team creation, the observation panel — without having to adopt a new mental model all at once. The Classic Driver lets you use familiar async patterns while still getting access to:

- **Smart selectors** with space-separated test IDs and ancestor navigation
- **Actor teams** with role-based configuration
- **The message bus** for coordination when you need it
- **The dev panel** showing assertions in real-time

Meanwhile, we're putting the Concurrent model into production to see how it holds up. Before 1.0, we'll decide: is Scenetest going to be a more ergonomic harness for running async specs, or a more complete philosophical rethink based on the concurrent drain model?

### Which should I use?

- **Concurrent** (`scene()`) — if you want the simplest possible specs, especially for multi-actor scenarios. No async/await to manage. This is the native model.
- **Classic Driver** (`test()`) — if you're coming from Playwright/Cypress and want familiar patterns, or need fine-grained control over timing.

Both models have access to the same actor methods, selectors, and coordination primitives. You can even use both in the same project (in different files). Just don't mix them in the same spec.
