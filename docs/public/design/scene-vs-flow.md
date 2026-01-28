# Concurrent Scene vs Classic Test — Two Execution Models

**STATUS: Both implemented.** One of them should be removed before 1.0.

Scenetest currently has two TypeScript execution models — **Concurrent** (`scene()`) and **Classic Driver** (`test()`). A third authoring style, **Text DSL** (`.spec.md` markdown files), compiles to the concurrent model.

This document exists so that future-us can make an informed decision about
which model to keep.  We are NOT shipping two ways to write scenes.  We're
holding both in the codebase while we evaluate them against real usage on
[sunlo.app](https://sunlo.app) and other projects.  Then we rip one out.

> **Note:** Text DSL markdown files (`.spec.md`) compile to `scene()` registrations.
> This is relevant to the decision — if we keep the concurrent model, markdown scenes
> work natively.  If we keep the classic driver, the markdown parser would need to
> be rewritten to emit `test()` registrations (or we keep `scene()` as the
> internal model for markdown scenes only).

For the full side-by-side comparison of both models (syntax, multi-actor patterns, coordination, conditional monitors), see the [Concurrent and Classic Mode reference](/reference/concurrent-and-classic).

---

## The two models

### Concurrent — scene(), reactive, concurrent draining

```typescript
scene('two users chat', ({ actor }) => {
  const alice = actor('alice')
  const bob = actor('bob')

  alice.openTo('/chat')
  alice.see('input').typeInto('input', 'Hello!').click('send')

  bob.openTo('/chat')
  bob.seeText('Hello!')
})
```

- The entire body is **synchronous declaration** — no `async`, no `await`.
- `actor()` returns a handle immediately (browser launches later).
- DSL calls queue without executing.
- After the function returns, browsers launch in parallel, then all actors
  drain their queues concurrently.
- Cross-actor synchronization happens through the DOM (and optionally the
  message bus), not through `await` ordering.
- Scope lives on the **actor** and flows through the queue during drain.

### Classic Driver — test(), await-driven, sequential orchestration

```typescript
test('two users chat', async ({ actor }) => {
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

---

## Why we're considering killing the classic driver

### 1. The conceptualisation race condition

In the classic driver model the test writer carries a mental timeline.  They
have to think: "has this happened yet?  should I await before checking?"
This is exactly the class of bug that `waitUntil` / `waitForSelector` /
`waitForNavigation` APIs exist to paper over in Playwright and Cypress.

In the concurrent model there is no race because each actor's observations (`see`,
`seeText`) naturally block/poll for DOM state.  You can write
`bob.seeText('Hello!')` before or after `alice.click('send')` in the
source code and it doesn't matter — bob will reach that instruction
whenever he reaches it in his queue.

### 2. Fewer abstractions

The classic driver has two objects: `SequentialActorHandle` (creates chains) and
`ActionChain` (accumulates actions, is thenable).  You need to understand
that `.see('x').click('y')` is a chain, that chains execute on `await`,
that scope resets between chains, and that `Promise.all` is required for
concurrency.

The concurrent model has one object: the actor.  Every method returns the actor.
Scope flows through the actor's queue.  Concurrency is the default, not
the opt-in.

### 3. Multi-actor scenes read better

Scene scripts that jump between actors read like screenplays in the
concurrent model.  There is no syntactic noise from `await` telling
the runtime things it could have figured out itself.

### 4. The await is lying

In the classic driver, `await` looks like it means "do this async thing."  But
the chain methods are synchronous — they just push closures onto an
array.  The only async thing is `then()`, which flushes the queue.  The
`await` is sugar for "flush now," which is an implementation detail
masquerading as a language feature.

---

## Why we might keep the classic driver

### 1. Familiarity

Every Playwright / Cypress / Puppeteer test ever written uses await-based
sequential orchestration.  People migrating from those tools will reach
for `test()` instinctively.  Asking them to unlearn `await` is a cost.

### 2. Explicit ordering is sometimes what you want

Some scenes genuinely need cross-actor ordering: "alice does X, then bob
does Y in response, then alice does Z."  In the classic driver this is trivially
expressed with sequential awaits.  In the concurrent model you need the message bus
(`emit` / `waitFor`) or you rely on DOM state being sufficient, which it
sometimes isn't (e.g. the ordering isn't observable in the UI).

### 3. Debugging is simpler

When something fails in classic driver mode, the stack trace points to a
specific `await` in a linear script.  In the concurrent model, multiple actors
are running concurrently, failures trigger abort cascades, and the
original error might be obscured by "actor X aborted: actor Y failed."

### 4. Incremental execution

With the classic driver you can put a breakpoint on any `await` and inspect state
between steps.  With the concurrent model, the declaration phase is instant and the
execution phase is a concurrent drain — stepping through it is less
intuitive.

---

## What we'd need to rip out

### If we keep concurrent (scene()), remove classic driver (test())

- Delete `ActionChainImpl` from `actor.ts` (the thenable chain)
- Delete `SequentialActorHandleImpl` (the handle that creates throwaway chains)
- Remove `test()` export from `scene.ts` (keep `sceneRegistry`, `runScene`,
  `when`)
- Remove `ActionChain` and `SequentialActorHandle` from `types.ts`
- Update `runner.ts` — it calls `runScene` which calls `scene.fn`,
  which already works with `scene()` since it registers as a scene
- Update all example specs from `test()` to `scene()`
- Update CLAUDE.md, README, and design docs
- `.spec.md` files already compile to `scene()` — no changes needed

### If we keep classic driver (test()), remove concurrent (scene())

- Delete `reactive.ts`
- Remove `scene` export from `index.ts`
- Remove `ConcurrentActorHandle`, `SceneContext`, `SceneFn` from `types.ts`
- Remove `getCurrentSession()` from `scene.ts`
- Revert `actionTimeout`/`warnAfter` to `private` on `TeamSession`
  (or leave — no harm)
- Delete `reactive.test.ts`
- **Rewrite `markdown-scene.ts`** to emit `test()` registrations
  instead of `scene()` — or keep `scene()` as an internal mechanism

The concurrent removal is much smaller, which is expected — `scene()` was added on
top of the classic driver infrastructure.  However, `.spec.md` files currently compile
to `scene()`, so removing the concurrent model would require either rewriting the markdown
parser or keeping `scene()` as an internal mechanism.

---

## Decision criteria

When evaluating, pay attention to:

1. **How often do you reach for `Promise.all`?** — If every multi-actor
   scene needs it, the classic driver is fighting you.
2. **How often do you need `emit`/`waitFor` in concurrent scenes?** — If every
   multi-actor scene needs explicit bus coordination, the concurrent model
   is fighting you.
3. **Which produces better error messages when a scene fails?**
4. **Which is easier to explain to someone who has never written an E2E
   test?**  (Not "someone migrating from Playwright" — someone new.)
5. **Which do you instinctively reach for when writing a new spec?**
   After a week of using both, which one feels like the default?

---

## Conversion strategy

If we decide to go all-in on one model, the conversion is mechanical:

**Classic driver → Concurrent**: Remove `await` from DSL calls.  Replace `Promise.all`
multi-actor blocks with plain sequential declarations (concurrency
becomes automatic).  For cross-actor ordering that relied on `await`
sequencing, add `emit`/`waitFor` pairs.

**Concurrent → Classic driver**: Add `await` to every DSL call or chain.  Replace
`emit`/`waitFor` pairs with sequential `await` ordering.  For
concurrent actor work, wrap in `Promise.all`.

Both conversions are grep-and-replace level.  Neither requires
rethinking the test logic.

---

## Implementation notes

- The concurrent model (`scene()`) registers as a normal scene internally — the runner does
  not know the difference.  This is intentional: it means both models
  share discovery, team management, reporting, and lifecycle hooks.
- `ConcurrentActorHandleImpl` duplicates some logic from `ActionChainImpl`
  (selector resolution, scope management, warning polling).  If we keep
  the concurrent model, we should extract shared helpers.  If we keep the classic driver,
  delete reactive.ts and the duplication goes away.
- The `if()` watcher API exists in both models but works slightly
  differently.  In the classic driver, watchers clear after each `await`.  In
  the concurrent model, `if()` is a one-shot persistent monitor — it polls during
  every action from the point it's declared, fires inline when the
  selector matches, then stops.  The concurrent version uses a queue-swap
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
