# Concurrent Flow & Classic Driver

Scenecheck offers two ways to write scene specs:
a **Concurrent Flow** and a **Classic Driver** model.

Both convert your instructions into interactions with Playwright-managed actor-browser instances to
run a spec to error ❌, timeout ❌, or completion ✅ – but they work quite differently under the hood.

If you have never used scripting tools like Cypress or Playwright, then _do not read this guide_. Just go learn
the Markdown DSL. But if you are coming from the classic `test('description', async () => void)` world, then
this guide may help you relax into the concurrent flow approach and take advantage of its declarative simplicity.

## The Classic Driver came first

When we started building Scenecheck, we began with test ergonomics just like the `await page` model from Playwright.

```ts
test('user searches for themself', async ({ actor }) => {
  const user = await actor('user-main')
  await user.openTo('/friend-search')
  await user.see('main-section search-form')
  await user.typeInto('search-input', user.username)
  await user.click(`view-search-result ${user.id}`)
})
```

It works fine for single-user flows, but we really wanted to focus on **multi-actor scenes** —
coordinating multiple users interacting with your app concurrently...
you know, like how people use things in real life.

## The Sticky Message Bus Cracked Something

To coordinate between actors, we initially built a sticky message bus with `emit()` and `waitFor()` – the stickiness means
that you can have one actor "look for" an event to be emitted, event though you had just emitted that event 2 lines prior.
This provides some nice syntax relaxant for whoever's writing the spec to write more naturally:

> ALICE sends a friend request to BOB, and then goes and does other stuff \
> BOB gets the friend request and responds

This is a lot more natural than having go sort of go back in time to write that you're watching for the event:

> BOB is waiting for a friend request \
> ALICE sends a friend request to BOB \
> promise.all(while ALICE goes and does some other things, BOB responds to the request)

The former feels a lot more natural to write than the latter. The message bus was an improvement, eliminating
_most_ of the need for `Promise.all` (😇), but it still felt like it was just starting to crack the concept.

## Concurrent drain was born

So we tried something different: what if the "sticky bus" approach became the default – what if each user just had their
own sticky queue? Then **the `scene` function is not _driving_ the browser, it's _declaring_ each actor's ordered list
of expectations and operations**. So you don't have to worry about async/await or `Promise.all` – we just build each queue,
and then run them all concurrently. So a scene can look like this:

```ts
scene('friend request flow', ({ actor }) => {
  const alice = actor('alice')
  const bob = actor('bob')

  alice.openTo('/search')
    .typeInto('search', bob.username)
    .click('send-request')

  bob.openTo('/notifications')
    .click('accept')
    .click('sidebar-menu chats-page-link')
    .see(`chat-list-item ${alice.id}`)

  alice.see('alert-friend-accepted')
    .click()
    .seeText(bob.username)
})
```

Nice, right? And very forgiving, and hopefully quite easy to reason about, to read and write. It also means that the following authoring styles produce identical results:

```ts
  // 1. chained ✅
  bob.openTo('/notifications')
    .click('accept')
    .click('sidebar-menu chats-page-link')
    .see(`chat-list-item ${alice.id}`)

  // 2. per action ✅
  bob.openTo('/notifications')
    .click('accept')
  bob.click('sidebar-menu chats-page-link')
    .see(`chat-list-item ${alice.id}`)

  // 3. per-line ✅
  bob.openTo('/notifications')
  bob.click('accept')
  bob.click('sidebar-menu chats-page-link')
  bob.see(`chat-list-item ${alice.id}`)
```

This forgiving syntax and grammar made concurrent model specs so simple that practically speaking, **anyone could write them**. And though we do have primitives for more direct manipulation and coordination between the queues,
most operations are simple enough that you can write them using this minimal markdown DSL:

```markdown [1. direct translation to md]
# friend request flow
alice:
- openTo /search
- typeInto search [bob.username]
- click send-request

bob:
- openTo /notifications
- click accept
- click sidebar-menu chats-page-link
- see chat-list-item [alice.id]

alice:
- see alert-friend-accepted
- click
- seeText [bob.username]


```
```markdown [2. functionally identical to 1]
# friend request flow
bob:
- openTo /notifications
- click accept
- click sidebar-menu chats-page-link
- see chat-list-item [alice.id]

alice:
- openTo /search
- typeInto search [bob.username]
- click send-request
- see alert-friend-accepted
- click
- seeText [bob.username]




```

Give it a try! Let go your inhibitions!

For single-actor scripts, there is very little difference, but for multi-actor scripts, you may have to un-learn
your desire to control exactly when each actor tries to do each thing. You might ask yourself...

1. "Does Bob _have_ to open the browser at a certain moment, in a certain order in relation to Alice, for my feature to work?
2. Do the friends have to accept Alice's friend requests one by one in sequential order that stays the
same on every run?
3. should my app work even if the friend requests are not all answered in the same order?

There's a good chance that your async/sequential driver is forcing you to take on a big mental burden,
and your reward is _worse_ tests that miss whole categories of multi-user race conditions and throw false positives
all the time (testing your tests, not your app).

## So Why keep both?

We wanted to make it easier for people to try Scenecheck's other benefits — inline/in-render checks, the forgiving+predictable selector logic, team creation, swarm mode, the observation and recording panel — without having to adopt a new mental model for writing specs.

Meanwhile, we're putting the Concurrent model into production to see how it holds up. Before 1.0, we'll decide: is Scenecheck going to be a more ergonomic harness for running async specs, or a more complete philosophical rethink based on the concurrent drain model?

## Which should I use?

- **Markdown DSL** - This should be your goto for writing new specs or converting old ones. If it doesn't let you do what you want to do, and you can't accomplish it with `emit`/`waitFor`, let us know!
- **Concurrent** (`scene()`) — If you have to move into a `.ts` authoring context for some reason, reach for
this one; it will be a direct translation from the Markdown DSL.
- **Classic Driver** (`test()`) — If you're coming from Playwright/Cypress and have specs that check for very specific multi-actor timing issues, where the async/await logic is required to reproduce a certain error condition, Classic mode is here for you. `emit`/`waitFor` coordination is available in both modes.
