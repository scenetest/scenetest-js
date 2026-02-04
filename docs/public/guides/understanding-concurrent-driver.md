# Understanding The Concurrent-Actor Driver

> Make it forgiving and predictable
>
> – Ancient Checkscene Philosophy

We write spec files linearly because that's how code works, but what we're trying
to simulate and test is a multi-threaded, concurrent world – my 5 users are awake at
the same time, and trying to do stuff together on the app!
So when you start trying to simulate multi-actor situations like in a chat app, social app,
or collaboration tool, a test driver should be able to manage this
concurrent actor behaviour naturally, reliably, ergonomically.

Imagine modeling the following scene in test code:

```md
## user1 sends a friend request; user2 sees the alert and accepts
user1:                                  user2:
login                                   login
searchFriend user2
see results-pane
click [user2.id] invite-btn
                                        see alert-friend-invite [user1.id]
                                        click accept-button
see alert-friend-accepted [user2.id]    see /friends/[user1.id]
click sidebar-chats-link                see friend-profile-picture [user1.id]
see [user2.username]
```

You're probably able to notice from the text above that the left and right side
are meant to be read as the independent, but interacting, flows of activity by
two entirely separate people on their own devices. Your brain probably doesn't
immediately worry whether the text is meant to be serialized from left to right
vs. top to bottom; you just understand.

And further, the interaction between the users here doesn't happen because of some aspect
of how we write the code. There's no `user1.run(action4).then(user2.run(action5))` – this
moves the scene along just because the script says it does. But the actor playing user2
is asking the director, "What's my motivation??" and the answer is: you are looking at your
screen and an alert comes in for a new friend invite.

This is a really important distinction for writing tests that are _honest_, where you aren't
baking in the same bad assumptions about the order of things to your tests that you
baked into your app, where actors progress through the experience based on what _they_ have
access to on their device, not based on what other actors experience or what the developer
understands about how things "should" work.

Checkscene's concurrent actor-drain model solves this in a nice and simple way: we don't try
to make you serialize actions across the actors; we just build a queue for each actor and
activate them all at once and let them each "drain" at the same time:

```ts
async drain(): Promise<void> {
  for (const action of this.queue) {
    await action.execute()
  }
}

async function drainAll(actors) {
  await Promise.allSettled(actors.map(actor => actor.drain()))
}
```

This means that for the above pseudo-scene-script, it doesn't matter whether you parse it top-down
or left-right. You'll get the same result. Serializing it for the purposes of writing the script doesn't
mean serializing the way it executes. The following are all valid styles for writing
scenes that all build the same exact pair of action queues:


```md [Sequential]
user1: login
user2: login

user1:
searchFriend user2
see results-pane
click [user2.id] invite-btn

user2:
see alert-friend-invite [user1.id]
click accept-button
see /friends/[user1.id]
see friend-profile-picture [user1.id]

user1:
see alert-friend-accepted [user2.id]
click sidebar-chats-link
see [user2.username]
```

```md [Mixed]
user1:
login
searchFriend user2
see results-pane
click [user2.id] invite-btn

user2:
// still fires on the first tick!
login
see alert-friend-invite [user1.id]
click accept-button
see /friends/[user1.id]
see friend-profile-picture [user1.id]

user1:
see alert-friend-accepted [user2.id]
click sidebar-chats-link
see [user2.username]
```

```md [Sorted]
user1:
login
searchFriend user2
see results-pane
click [user2.id] invite-btn
// time will pass while user2 accepts my request
see alert-friend-accepted [user2.id]
click sidebar-chats-link
see [user2.username]

user2:
// fires in the first tick, same as user1's login
login
// ready for invite to come
see alert-friend-invite [user1.id]!
click accept-button
see /friends/[user1.id]
see friend-profile-picture [user1.id]
```

```md [1-Liners]
user1: login
user2: login
user1: searchFriend user2
user1: see results-pane
user1: click [user2.id] invite-btn
user2: see alert-friend-invite [user1.id]
user2: click accept-button
user2: see /friends/[user1.id]
user2: see friend-profile-picture [user1.id]
user1: see alert-friend-accepted [user2.id]
user1: click sidebar-chats-link
user1: see [user2.username]






```

For me, the "Mixed" approach feels the nicest to write.
For you, maybe you are pure of heart and prefer the sequential style,
or maybe you find it easier to get into your users' shoes by writing each one as its own section (sorted),
or maybe you long for old school chat rooms so the "strict" mode is your fave.

In any case, the concurrent drain approach doesn't care.
If one actor can't proceed because they're waiting for an alert the other actor hasn't sent yet,
that's fine. It will time out if _none_ of the actors can proceed, but otherwise it will just
chug along, and if one actor makes it to the and of their queue but another one does, well, that's
good information.

There's no magic there, so once you understand how the queue drain works, you should be able to follow write and write scenes with ease. But what do you think? Did we accomplish our goal?


```

The classic (sequential) driver will need you to put this in some kind of linear order,
using a ton of `await page...` calls. And if you want to be slightly nonlinearly or to simulate
concurrent activity within your app (a reasonable thing to want to work correctly!) you need
to dip into `Promise.all` and the ergonomics go to 💩 very quickly.

The concurrent model isn't so strict. The example block below shows the same script written 3 ways.
The first one is written so it will execute the same way whether it's run in a single thread or
multi-threaded.


In the classic (sequential) approach to writing specs, we take this multi-actor scene
and flatten it into one linear script, enforcing a strict order on every single action
and observation — either by `await`ing everything in sequence, or reaching for
`Promise.all` whenever we need to simulate two branches of activity happening
at the same time.

This is a valid and correct concurrent spec for the thing we're trying to describe, but
we've written it

```md
user2: login

user1:
login
searchFriend user2
see results-pane
click [user2.id] invite-btn

user2:
see alert-friend-invite [user1.id]
click accept-button
see /friends/[user1.id]
see friend-profile-picture [user1.id]

user1:
see alert-friend-accepted [user2.id]
click sidebar-chats-link
see [user2.username]
```



Checkscene's **concurrent model** takes a different approach. You just write what happens, roughly in order,
and it will work.

---

## What the concurrent model actually does

The `scene()` function collects actions into per-actor queues during a synchronous
declaration phase. Nothing executes until the function returns. Then all actors drain
concurrently — each actor runs its own queue sequentially, but all actors run in
parallel with each other.

So the friend-invite scene above is written like this:

```typescript
import { scene } from '@checkscene/scenes'

scene('user1 invites user2 as a friend', ({ actor }) => {
  const user1 = actor('user1')
  const user2 = actor('user2')

  // These are all declarations — nothing runs yet.
  // Each line pushes an action onto that actor's queue.

  user2.openTo('/login')
  user2.see('login-form').typeInto('email', user2.email!).typeInto('password', user2.password!).click('submit')

  user1.openTo('/login')
  user1.see('login-form').typeInto('email', user1.email!).typeInto('password', user1.password!).click('submit')
  user1.see('search-friends').typeInto('search-friends', 'user2')
  user1.see('results-pane')
  user1.click([user2.id!, 'invite-btn'])

  user2.see(['alert-friend-invite', user1.id!])
  user2.click('accept-button')
  user2.see(['/friends/', user1.id!])
  user2.see(['friend-profile-picture', user1.id!])

  user1.see(['alert-friend-accepted', user2.id!])
  user1.click('sidebar-chats-link')
  user1.see([user2.username!])
})
```

After the function returns, the framework:
1. Launches one browser per actor (in parallel)
2. Calls `drainAll()` — which is essentially `Promise.all(user1.drain(), user2.drain())`
3. Each actor runs through its own queue top-to-bottom, as fast as the DOM allows

The concurrent model doesn't care whether user2's 5th action comes before or after
user1's 5th action. It only cares about the order within each actor's own queue.
Timing coordination between the two actors usually happens naturally through the DOM —
user2's `see(['alert-friend-invite', user1.id!])` will simply poll until that element
appears.

---

## How this compares to classic driver mode

The same scene in classic `test()` mode flattens into a single `await` sequence:

```typescript
import { test } from '@checkscene/scenes'

test('user1 invites user2 as a friend', async ({ actor }) => {
  const user1 = await actor('user1')
  const user2 = await actor('user2')

  await user2.openTo('/login')
  await user2.see('login-form').typeInto('email', user2.email).typeInto('password', user2.password).click('submit')

  // Everything runs in the order you await it.
  // user1 sits idle until you explicitly hand control to them.

  await user1.openTo('/login')
  await user1.see('login-form').typeInto('email', user1.email).typeInto('password', user1.password).click('submit')
  await user1.see('search-friends').typeInto('search-friends', 'user2')
  await user1.see('results-pane')
  await user1.click([user2.id, 'invite-btn'])

  // Switch back to user2
  await user2.see(['alert-friend-invite', user1.id])
  await user2.click('accept-button')

  // Back to user1
  await user1.see(['alert-friend-accepted', user2.id])
  await user1.click('sidebar-chats-link')
  await user1.see([user2.username])
})
```

Notice how rigid this script is! Every line is an `await`; if you want to get user2 logging in early, you have to track
the promise and await it later, or rather because logging in requires two steps, you have to create a promise chain and track that and
await it before you start to do anything else with that agent. What a pain!


If you want all your users to log in at once, you have to use `Promise.all`, or you have to track unresolved
promises for different actors and make sure to await them before the next time you want to drive that agent forward.

It's just all so much work! And for what?? We're not benefitting from this. We already have 2 separate virtual browsers
running for each different agent; there is no need for the action queue to be shared across

Notice the problem: we've forced a single timeline onto a two-actor scene. User2 can't
even start logging in until user1 has finished the invite flow. In real usage, both users
would be logged in simultaneously. You _could_ fix this with `Promise.all`, but it gets
messy fast and defeats the purpose of the linear readable-script format.

The classic mode is not bad — it's familiar if you come from Playwright or Cypress, and
for single-actor scenes it's perfectly clear. But multi-actor scenes are its weakness.

---

## The message bus

Both modes share a **sticky message bus**. "Sticky" means: if a message was already
emitted before someone listens for it, the listener resolves immediately. This
eliminates race conditions from setup ordering.

### When do you need it?

**Usually you don't.** In the friend-invite example above, no bus coordination is needed.
User2's `see(['alert-friend-invite', user1.id!])` polls the DOM — it just waits until the
invite notification appears. The DOM is the synchronization mechanism.

You need the bus when **ordering isn't observable in the DOM**:

- User1 must finish a setup step before user2 starts, but there's no visible indicator
- Multiple actors need to reach a rendezvous point (all logged in) before the test begins
- A state change happens server-side with no immediate UI feedback

### In concurrent mode: `emit()` / `waitFor()`

These are actions on the actor, part of the queue like any other DSL call:

```typescript
scene('rendezvous then collaborate', ({ actor }) => {
  const user1 = actor('user1')
  const user2 = actor('user2')

  user1.openTo('/login')
  user1.see('login-form').typeInto('email', user1.email!).typeInto('password', user1.password!).click('submit')
  user1.see('dashboard')
  user1.emit('user1-ready')            // queued action: when reached, post message to bus

  user1.waitFor('user2-ready')         // queued action: block this queue until message arrives
  user1.openTo('/collab')
  user1.see('editor')

  user2.openTo('/login')
  user2.see('login-form').typeInto('email', user2.email!).typeInto('password', user2.password!).click('submit')
  user2.see('dashboard')
  user2.emit('user2-ready')

  user2.waitFor('user1-ready')
  user2.openTo('/collab')
  user2.seeText('user1 is here')
})
```

Because messages are sticky, it doesn't matter who gets there first. If user1 emits
`'user1-ready'` before user2 calls `waitFor('user1-ready')`, user2 resolves instantly.
If user2 reaches `waitFor` first, they block until user1 catches up.

### In classic mode: `emit()` / `waitFor()`

Classic mode also has access to `emit()` and `waitFor()` on actors. The `waitFor()`
call returns a promise that resolves when the named message arrives on the bus:

```typescript
import { test } from '@checkscene/scenes'

test('rendezvous then collaborate', async ({ actor }) => {
  const user1 = await actor('user1')
  const user2 = await actor('user2')

  // Both log in (still sequential — classic mode)
  await user1.openTo('/login')
  await user1.see('login-form').typeInto('email', user1.email).typeInto('password', user1.password).click('submit')
  await user1.see('dashboard')
  await user1.emit('user1-ready')

  await user2.openTo('/login')
  await user2.see('login-form').typeInto('email', user2.email).typeInto('password', user2.password).click('submit')
  await user2.see('dashboard')
  await user2.emit('user2-ready')

  // waitFor blocks until the message arrives on the bus
  await user1.waitFor('user2-ready')
  await user2.waitFor('user1-ready')

  await user1.openTo('/collab')
  await user2.openTo('/collab')
  await user2.seeText('user1 is here')
})
```

Because messages are sticky, if user1 emits `'user1-ready'` before user2 calls
`waitFor('user1-ready')`, user2 resolves instantly. The same `emit()` / `waitFor()`
pattern works in both concurrent and classic modes.

---

## Markdown specs

The same scene as plain text. Markdown specs compile to `scene()` — concurrent model:

```markdown
# user1 invites user2 as a friend

user1:
- openTo /login
- see login-form
- typeInto email [user1.email]
- typeInto password [user1.password]
- click submit
- see search-friends
- typeInto search-friends user2
- see results-pane
- click [user2.id] invite-btn
- see alert-friend-accepted [user2.id]
- click sidebar-chats-link
- see [user2.username]

user2:
- openTo /login
- see login-form
- typeInto email [user2.email]
- typeInto password [user2.password]
- click submit
- see alert-friend-invite [user1.id]
- click accept-button
- see /friends/[user1.id]
- see friend-profile-picture [user1.id]
```

Each actor heading becomes an actor. Each line becomes a queued action.
The result is identical to writing `scene()` by hand.

---

## Summary

All three authoring styles produce the same thing: **a queue of Playwright
instructions per actor**, coordinated by a shared sticky message bus.

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  scene() — TS   │   │  test() — TS    │   │  .spec.md       │
│                 │   │                 │   │                 │
│ Sync body       │   │ Async body      │   │ Compiled to     │
│ Concurrent drain│   │ Sequential await│   │ scene()         │
│ emit()/waitFor()│   │ emit()/waitFor()│   │ emit/waitFor    │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │  Per-actor action queue  │
                  │  [openTo, see, click...] │
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │       Playwright         │
                  │  locator.click()         │
                  │  locator.fill()          │
                  │  locator.waitFor()       │
                  │  page.goto()             │
                  └────────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  │   Sticky message bus     │
                  │                          │
                  │  Messages persist.       │
                  │  Late listeners resolve  │
                  │  instantly. No races.    │
                  └─────────────────────────┘
```
