# scene() vs flow() — Two Execution Models

**STATUS: Both implemented.** One of them should be removed before 1.0.

This document exists so that future-us can make an informed decision about
which model to keep.  We are NOT shipping two ways to write scenes.  We're
holding both in the codebase while we evaluate them against real usage on
[sunlo.app](https://sunlo.app) and other projects.  Then we rip one out.

---

## The two models

### scene() — await-driven, sequential orchestration

```typescript
scene('two users chat', async ({ actor }) => {
  const alice = await actor('alice')
  const bob = await actor('bob')

  await alice.openTo('/chat')
  await alice.see('input').typeInto('input', 'Hello!').click('send')

  await bob.openTo('/chat')
  await bob.seeText('Hello!')
})
```

- Each `await` is an execution boundary.
- The test author controls ordering explicitly.
- Multi-actor concurrency requires explicit `Promise.all()`.
- Scope lives on the **chain** (a new chain starts at each `await`).

### flow() — reactive, concurrent draining

```typescript
flow('two users chat', async ({ actor }) => {
  const alice = await actor('alice')
  const bob = await actor('bob')

  alice.openTo('/chat')
  alice.see('input').typeInto('input', 'Hello!').click('send')

  bob.openTo('/chat')
  bob.seeText('Hello!')
})
```

- DSL calls are **declarations** — they queue without executing.
- After the function returns, all actors drain their queues concurrently.
- Cross-actor synchronization happens through the DOM (and optionally the
  message bus), not through `await` ordering.
- Scope lives on the **actor** and flows through the queue during drain.

---

## Why we're considering killing scene()

### 1. The conceptualisation race condition

In the `scene()` model the test writer carries a mental timeline.  They
have to think: "has this happened yet?  should I await before checking?"
This is exactly the class of bug that `waitUntil` / `waitForSelector` /
`waitForNavigation` APIs exist to paper over in Playwright and Cypress.

In `flow()` there is no race because each actor's observations (`see`,
`seeText`) naturally block/poll for DOM state.  You can write
`bob.seeText('Hello!')` before or after `alice.click('send')` in the
source code and it doesn't matter — bob will reach that instruction
whenever he reaches it in his queue.

### 2. Fewer abstractions

`scene()` has two objects: `ActorHandle` (creates chains) and
`ActionChain` (accumulates actions, is thenable).  You need to understand
that `.see('x').click('y')` is a chain, that chains execute on `await`,
that scope resets between chains, and that `Promise.all` is required for
concurrency.

`flow()` has one object: the actor.  Every method returns the actor.
Scope flows through the actor's queue.  Concurrency is the default, not
the opt-in.

### 3. Multi-actor scenes read better

Scene scripts that jump between actors read like screenplays when
written with `flow()`.  There is no syntactic noise from `await` telling
the runtime things it could have figured out itself.

### 4. The await is lying

In `scene()`, `await` looks like it means "do this async thing."  But
the chain methods are synchronous — they just push closures onto an
array.  The only async thing is `then()`, which flushes the queue.  The
`await` is sugar for "flush now," which is an implementation detail
masquerading as a language feature.

---

## Why we might keep scene()

### 1. Familiarity

Every Playwright / Cypress / Puppeteer test ever written uses await-based
sequential orchestration.  People migrating from those tools will reach
for `scene()` instinctively.  Asking them to unlearn await is a cost.

### 2. Explicit ordering is sometimes what you want

Some scenes genuinely need cross-actor ordering: "alice does X, then bob
does Y in response, then alice does Z."  In `scene()` this is trivially
expressed with sequential awaits.  In `flow()` you need the message bus
(`emit` / `waitFor`) or you rely on DOM state being sufficient, which it
sometimes isn't (e.g. the ordering isn't observable in the UI).

### 3. Debugging is simpler

When something fails in `scene()` mode, the stack trace points to a
specific `await` in a linear script.  In `flow()` mode, multiple actors
are running concurrently, failures trigger abort cascades, and the
original error might be obscured by "actor X aborted: actor Y failed."

### 4. Incremental execution

With `scene()` you can put a breakpoint on any `await` and inspect state
between steps.  With `flow()`, the declaration phase is instant and the
execution phase is a concurrent drain — stepping through it is less
intuitive.

---

## What we'd need to rip out

### If we keep flow(), remove scene()

- Delete `ActionChainImpl` from `actor.ts` (the thenable chain)
- Delete `ActorHandleImpl` (the handle that creates throwaway chains)
- Remove `scene()` from `scene.ts` (keep `sceneRegistry`, `runScene`,
  `when`)
- Remove `ActionChain` and `ActorHandle` from `types.ts`
- Update `runner.ts` — it calls `runScene` which calls `scene.fn`,
  which already works with `flow()` since flow registers as a scene
- Update all example specs from `scene()` to `flow()`
- Update CLAUDE.md, README, and design docs
- Consider renaming `flow()` → `scene()` since there would be only one
  model and "scene" is the better name

### If we keep scene(), remove flow()

- Delete `reactive.ts`
- Remove `flow` export from `index.ts`
- Remove `ReactiveActor`, `FlowContext`, `FlowFn` from `types.ts`
- Remove `getCurrentSession()` from `scene.ts`
- Revert `actionTimeout`/`warnAfter` to `private` on `TeamSession`
  (or leave — no harm)
- Delete `reactive.test.ts`

The flow removal is much smaller, which is expected — flow was added on
top of scene infrastructure.

---

## Decision criteria

When evaluating, pay attention to:

1. **How often do you reach for `Promise.all`?** — If every multi-actor
   scene needs it, the await model is fighting you.
2. **How often do you need `emit`/`waitFor` in flows?** — If every
   multi-actor flow needs explicit bus coordination, the reactive model
   is fighting you.
3. **Which produces better error messages when a scene fails?**
4. **Which is easier to explain to someone who has never written an E2E
   test?**  (Not "someone migrating from Playwright" — someone new.)
5. **Which do you instinctively reach for when writing a new spec?**
   After a week of using both, which one feels like the default?

---

## Conversion strategy

If we decide to go all-in on one model, the conversion is mechanical:

**scene → flow**: Remove `await` from DSL calls.  Replace `Promise.all`
multi-actor blocks with plain sequential declarations (concurrency
becomes automatic).  For cross-actor ordering that relied on `await`
sequencing, add `emit`/`waitFor` pairs.

**flow → scene**: Add `await` to every DSL call or chain.  Replace
`emit`/`waitFor` pairs with sequential `await` ordering.  For
concurrent actor work, wrap in `Promise.all`.

Both conversions are grep-and-replace level.  Neither requires
rethinking the test logic.

---

## Implementation notes

- `flow()` registers as a normal `scene()` internally — the runner does
  not know the difference.  This is intentional: it means both models
  share discovery, team management, reporting, and lifecycle hooks.
- `ReactiveActorHandle` duplicates some logic from `ActionChainImpl`
  (selector resolution, scope management, warning polling).  If we keep
  flow, we should extract shared helpers.  If we keep scene, delete
  reactive.ts and the duplication goes away.
- The `if()` watcher API exists in both models but works slightly
  differently.  In `scene()`, watchers clear after each `await`.  In
  `flow()`, `if()` is a one-shot persistent monitor — it polls during
  every action from the point it's declared, fires inline when the
  selector matches, then stops.  The flow version uses a queue-swap
  trick: the callback receives the actor, but DSL calls inside it push
  to the monitor's sub-action list instead of the main queue:
  ```ts
  alice.if('welcome-modal', a => a.click('dismiss'))
  ```
  When the monitor fires mid-action, the sub-actions execute inline
  (pausing the current action), using the actor's live scope.  No
  separate API needed.

---

*Written during initial implementation.  Re-evaluate after real-world
usage on sunlo.app.*
