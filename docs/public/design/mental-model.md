# Validating Your Mental Model

> **Status:** Design article. The framing here is meant to drive both docs voice and primitive prioritization (notably: a `count()` / `budget()` primitive falls out of this naturally).

---

## The pitch in one sentence

**Scenes describe what the user does. Checks describe what the developer assumed.**

A scene is "click the button, then the cart should show two items." That's app behavior, observable from outside, the sort of thing an E2E framework has always done. A check is "by the way, this effect should have fired exactly once during that interaction" — which is invisible from the outside, untyped, undocumented, and the source of an alarming fraction of real-world bugs.

Most testing tools only help you with the first kind. Scenetest exists because the second kind is where the leaks are.

---

## Why this category needs its own tool

Some invariants live comfortably in the type system: "this function takes a string and returns a number." Some live comfortably in unit tests: "given input X, the pure function returns Y." Some live comfortably in E2E tests: "the user can log in."

But a large class of invariants live nowhere:

- They're **runtime-only** — they depend on timing, render order, mount/unmount cycles, network responses, effect cleanup.
- They're **non-local** — the assumption is in component A, but the violation happens in component B's effect three commits later.
- They're **"too obvious to write down"** — the developer knows the rule in their head, never types it anywhere, and has to re-derive it every time they touch the file.
- They're **"too cheap to formalize"** — building a real runtime architecture (a state machine, a reactive store, a saga library) would cost more than the bug is worth. But the assumption is still load-bearing.

That last category is the interesting one. A leaky abstraction you've consciously decided not to patch up with formal architecture is fine — *as long as something is watching*. Scenetest is what watches.

---

## A taxonomy of mental-model gotchas

Use this as a menu. Each row is "a thing the developer believes," followed by the kind of check that would catch it being false.

### Invariants between two values

| Mental model | Check shape | Status |
|---|---|---|
| These two variables must change in lockstep | Assert equality (or derivation) at every relevant tick | ✅ `should()` today |
| This boolean flag matches whether these values differ from initial | `should(isDirty === !deepEqual(values, initial))` | ✅ today |
| The URL state matches the in-memory state after navigation | Cross-context assertion in scene | ✅ today |

### Eventual consistency (one value follows another)

| Mental model | Check shape | Status |
|---|---|---|
| When A changes, B should converge to match within N ticks | "Eventually" assertion — see in-flight branch | 🚧 stubbed |
| After mutation, related cache keys are invalidated before next read | Sequenced check | 🚧 partial |
| Loading state always terminates in success or error (never "forever spinning") | Eventually-resolved assertion | 🚧 |

### Cross-context coherence

| Mental model | Check shape | Status |
|---|---|---|
| The browser sees the cart updated; the server also reflects it | `serverCheck(() => db.query(...))` | 🚧 scaffolded, not E2E |
| Two tabs of the same app converge after a write | Multi-context scene | 📐 design |
| Optimistic UI matches server state after settle | Pair of checks bracketing the mutation | 🚧 |

### Counting and budgets

This is the cheat-code category. A surprising fraction of mental-model bugs reduce to "count something and assert a bound."

| Mental model | Check shape | Status |
|---|---|---|
| This effect should never run more than 3 times per render cycle | `budget(fn).atMost(3)` | 📐 not built |
| This component should re-render at most once when I type a character | Render counter scoped to interaction | 📐 |
| This network request should fire exactly once on mount | Request counter | 📐 |
| Memoized selector should not recompute when unrelated state changes | Recomputation counter | 📐 |
| Exactly one `[role=dialog]` exists at any time | DOM cardinality assertion | ✅ via `should()` |
| Hovering a card prefetches at most once per session | Scoped counter | 📐 |

**Why this matters as a primitive:** today you'd express each of these with a ref, a `useEffect`, and a manual `should()`. A first-class `count()` / `budget()` primitive would collapse the whole row.

### Pairing and balance

| Mental model | Check shape | Status |
|---|---|---|
| Every `subscribe()` is matched by `unsubscribe()` by teardown | Refcount returns to zero | 📐 |
| Every `acquire()` releases | Resource pool balance | 📐 |
| Every optimistic update is followed by commit or rollback (never orphaned) | Pending-state drain assertion | 📐 |
| Every `setTimeout` set during this scene is cleared (no orphan timers) | Timer audit | 📐 |
| Every opened modal is closed; focus is restored to opener | Focus stack invariant | 📐 |

### Ordering and causality

| Mental model | Check shape | Status |
|---|---|---|
| Effect A runs strictly before Effect B in the same commit | Sequence assertion | 📐 |
| Previous effect's cleanup runs before next effect | Cleanup-order assertion | 📐 |
| Focus moves to new element *after* it's mounted, not before | Sequenced DOM check | 📐 |
| Mutation completes before navigation kicks off | Ordered scene step | ✅ today |

### Identity and stability

| Mental model | Check shape | Status |
|---|---|---|
| This callback reference is stable across renders (useCallback actually working) | Reference-equality check across ticks | 📐 |
| Context value identity only changes when content changes | Identity-vs-content diff | 📐 |
| List keys remain stable across reorder (no surprise remounts) | Key stability check | 📐 |

### Race and staleness

| Mental model | Check shape | Status |
|---|---|---|
| Stale responses are discarded, not applied | "If superseded, bail" assertion | 📐 |
| Double-submit is prevented at the boundary (not just disabled button) | Single-fire check | 📐 |
| Debounced function eventually fires if input stopped | Eventually-fires assertion | 🚧 |

### Scope and propagation

| Mental model | Check shape | Status |
|---|---|---|
| Every fetch inside this scope carries the auth/tenant header | Header-on-all-requests check | 📐 |
| Every log line in this request carries the trace ID | Field-on-all-logs check | 📐 |
| Errors thrown inside this boundary are caught by *this* boundary | Catch-locality assertion | 📐 |

### Idempotency under retry / StrictMode

| Mental model | Check shape | Status |
|---|---|---|
| Running the effect twice produces the same observable state as once | Idempotency check (run-twice diff) | 📐 |
| Replaying a reducer action produces the same next state | Reducer-purity check | ✅ unit-testable, but worth runtime-asserting |

### Layout and a11y invariants

| Mental model | Check shape | Status |
|---|---|---|
| Focus stays trapped inside open modal; restored on close | Focus invariant | 📐 |
| ARIA tree shape matches visible tree (no orphan `aria-describedby` targets) | Reference integrity check | 📐 |
| Scroll position preserved across re-render | Layout invariant | 📐 |

---

## Why the "leaky abstraction" framing matters

There's a recurring pattern in frontend code:

> "I know this works *most* of the time. I know the edge case exists. Fixing it properly means introducing a state machine / a reactive store / a saga / a queue. That's too much architecture for one feature. I'll just be careful."

That trade-off is often correct. Architecture has a cost; not every leak deserves a patch. But "I'll just be careful" is unfalsifiable — three months later someone else touches the file and the carefulness evaporates.

Scenetest offers a middle path: **leave the leaky abstraction in place, and add a runtime guard that screams when the assumption breaks.** The guard lives next to the code that depends on it, runs every time the test suite runs (and optionally in dev), and is cheaper than the architecture would have been.

This is the same trade-off types offer at the boundary, extended to invariants that types can't reach.

---

## How this should shape the API

A few principles fall out:

1. **Cardinality is a first-class primitive.** Counting renders, fires, requests, DOM matches, and resource acquisitions covers a huge slice of the table above. A `count()` / `budget()` primitive belongs near the top of the roadmap.

2. **Checks should be co-located with the code they guard.** A check buried in a separate test file doesn't help the next developer touching the suspect code. Inline `should()` (the current model) is right.

3. **Scenes and checks are complementary, not redundant.** A scene without checks tells you "the happy path works." Checks without a scene tell you "this invariant holds in isolation." The combination — a scene that exercises the code while inline checks watch the invariants — is what catches the bugs that ship.

4. **Mental-model checks are most persuasive when the bug is invisible to a normal E2E.** Double-mount fires-twice, stale response overwrites fresh, memo broken so everything re-renders — the app *looks* fine, ships, and bleeds correctness or perf silently. These are the examples to lead with in user-facing docs.

---

## Open questions

- Should `budget()` be a separate primitive or sugar over `should()` + a ref-counter?
- For scoped counting ("during this interaction"), what's the scope boundary — a scene step, an actor action, an explicit `withinScope()` block?
- How do we surface idempotency violations under StrictMode without making every check fire twice?
- Is there a clean way to express "this invariant holds at every tick" vs. "this invariant holds eventually" without making the user pick the wrong one?

These don't need to be resolved before shipping more of the table above as docs, but they're the design conversations that follow naturally.
