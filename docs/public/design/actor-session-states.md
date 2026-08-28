# Actor Session States

**STATUS: Design Stage** — not implemented. Warmup exists today as an
undocumented `ActorConfig` field with a lazy cache and a hand-rolled DSL
executor; this doc proposes named states, an eager parallel warmup phase, and
retiring that second executor.

---

## The problem

Most scenes open by logging an actor in. That preamble is invisible work: it
isn't what the scene is testing, it repeats verbatim across scenes, and it
pushes authors toward large scenes because splitting one in two means paying
for the login twice.

Measured on a real suite (Sunlo, 161 scenes across 43 files, 619s, run
sequentially):

| Repeated work | Count | Total | % of run |
|---|---|---|---|
| Login preamble | 145 | 149.4s | 24.1% |
| Landing navigation (first non-login `openTo`) | 141 | 43.0s | 6.9% |
| **Repeated setup, total** | | **192.4s** | **31%** |
| Context creation + page boot (unattributed) | 161 | 3.4s | 0.5% |

Two things this rules out. Browser-context churn is not the cost — 3.4s across
the whole run. And the repetition is concentrated: 145 logins draw on just
**7 distinct actor keys**, so the same handful of sessions are rebuilt over and
over.

## What exists today

`ActorConfig.warmup` (`types.ts:53`) takes a macro name or a function.
`WarmupCache` (`warmup.ts`) runs it at most once per `config.key`, on first
use, and replays the captured `storageState` into every later context.

The mechanism is sound. Three things limit it:

1. **One unnamed state per actor.** An actor is either warmed or not. There is
   no way to say "this actor, logged in" versus "this actor, fresh".
2. **Effectively undocumented.** One incidental mention across the whole docs
   site (`reference/cli.md`). `guides/building-teams.md` walks through actor
   files in detail and never mentions it. The Sunlo suite above does not use
   it, which is why it pays 149s.
3. **A second, weaker DSL executor.** `executeMacroOnPage` (`warmup.ts:118`)
   supports 6 of the 24 verbs in `DSL_ACTIONS` and throws on the rest. A login
   that settles on `notSee login-form` — the natural way to write "the form
   went away" — cannot be expressed as a warmup macro, and fails at run time.

## Session state is not world state

The design turns on one distinction.

**Session state** is reconstructible from `context.storageState()`: cookies and
localStorage. Capture it once, replay it into any number of contexts. `logged-in`
and `fresh` are session states.

**World state** is a row in a database, often a relationship *between* actors.
`friend-accepted` is a world state. No storageState makes it true. Caching it
the way sessions are cached produces a context that believes a friendship
exists while the database disagrees — and the failure surfaces later, in a
scene that looks unrelated.

**Only session state belongs in this design.** World state is set up and torn
down at file boundaries, where `setup:` and `cleanup:` already point. Keeping
the two apart is the whole reason this can be cached at all.

## The design

### Named states

A team declares its session states as a map, and each actor declares which of
them apply:

```ts
export default defineTeam({
  states: {
    'logged-in': login,          // a macro name or a function
    'onboarded': completeOnboarding,
  },
  actors: {
    learner: { key: 'learner', email: '…', password: '…',
               states: ['logged-in', 'onboarded'] },
    visitor: { key: 'visitor' },   // no states — 'fresh' is the default
  },
})
```

`fresh` is the reserved name for "no state applied". It is always available and
never warmed.

### Specs read as stage directions

```markdown
## learner adds a phrase from the feed

learner: logged-in
friend: fresh
```

This is the point of the feature. A reader learns the scene's preconditions
from the top of the scene instead of reverse-engineering them from the first
six actions.

### States compose linearly, not as sets

A state may extend exactly one parent:

```ts
'onboarded': { extends: 'logged-in', run: completeOnboarding },
```

The cache replays the parent's `storageState` and runs only the delta. Sets are
excluded deliberately: `logged-in + onboarded + friend-accepted` gives a
combinatorial cache and an ordering question with no good answer. A genuine
combination is a new named state, which also reads better in the spec.

### One eager warmup phase

After `loadScenes()` and before the first scene, warm every declared
(team, actor, state) triple concurrently.

Warming *every declared triple* rather than computing the needed set is a
deliberate simplification. The precise set is not fully computable —
`RegisteredScene.roles` is populated automatically for `.spec.md` but is
optional for `.spec.ts` (`scene.ts:76`) — so a precise-set design needs a
static analysis it cannot always complete, plus a lazy fallback for the gaps.
Eager-all needs neither. It is one code path.

The cost is bounded by what authors declare, not by a cross product: states are
per-actor, and most actors have one or two. A 3-team suite with 6 actors
averaging ~1.7 states is ~30 warmups; run 6–8 wide, that is ~4–5s of startup.

Note what this phase does and does not buy. Lazy caching already performs the
same number of warmups — one per (actor, state), on first use. **The 143s
saving comes from caching at all, not from doing it eagerly.** Eager buys two
smaller things: parallelism (~7s serial becomes ~2s on the measured suite), and
every warmup failure surfacing before scene one instead of ambushing the run
40 scenes in.

### Cache key

`(team, actor.key, stateName)`. Today's key is `config.key` alone
(`warmup.ts:63`); with named states that collides `learner: logged-in` with
`learner: fresh`, and first-write wins. The team must be in the key because
each team carries distinct credentials.

## Retiring the second executor

`applyDslAction` (`dsl.ts:219`) already dispatches all 24 verbs against the
`DslTarget` interface (`types.ts:994`), with a `never` assignment that makes the
switch exhaustive over `DSL_ACTIONS` — adding a verb is a compile error there.
`executeMacroOnPage` escapes that guarantee entirely and silently falls further
behind with every verb added.

The obstacle is real but small: `applyDslAction` returns `void` and does not
await, because it drives queue-building targets — actor handles record a chain
and drain later. Warmup executes immediately on a bare page with nothing to
drain it.

The fix is a `DslTarget` implementation over a bare `Page` that pushes thunks
into an array, which the warmup runner then awaits in order. That deletes
`executeMacroOnPage`, gives warmup all 24 verbs, and puts warmup macros back
under the exhaustiveness check.

**This is a prerequisite, not a follow-up.** Until it lands, any login settling
on a negative assertion cannot be written as a warmup macro at all.

## Out of scope

**Disk persistence.** Writing captured states to `.scenetest/state/` would make
a re-run pay zero instead of ~5s, which matters most for filtered runs
(`--only one-file.spec.md` otherwise warms everything). It is deferred: the
saving is small next to the in-memory cache's, and it needs a real invalidation
key — a hash of (state source, credentials, `baseUrl`, seed-data version) —
because a stale session replayed against re-seeded data fails looking exactly
like an application bug. Revisit when startup time is the complaint.

**World-state fixtures.** Named world states hoisted to file boundaries are a
natural companion to this work and a separate design.

**Type safety for state names.** `defineTeam` is currently non-generic
(`config.ts:187`), and every role check is a runtime throw
(`team-manager.ts:189, 369, 422, 556`). Making it generic would give `.spec.ts`
real inference. `.spec.md` cannot be checked by tsc at all and needs a
`scenetest check` subcommand — which would also catch unknown roles, macros,
and selectors, all runtime-only failures today. Both are worth doing and
neither blocks this.

## Open questions

- **Does `storageState` replay actually carry the session?** It holds cookies
  and localStorage. An app that establishes in-memory state during the form
  submit will not reproduce from a replay. This is falsifiable in an afternoon
  on one file, and the whole design rests on it. Settle it before building the
  phase.
- **What happens when a warmup fails?** Failing the run is right for a state
  every scene needs and wrong for one used twice. Options: fail fast, or mark
  the state broken and fail only the scenes that ask for it.
- **Should `fresh` be spellable in a spec?** Writing `visitor: fresh` is
  redundant but reads well as a stage direction — it tells a reader the
  anonymity is deliberate.

## Implementation order

1. `DslTarget` adapter over a bare page; delete `executeMacroOnPage`.
2. Named states in `defineTeam` + `ActorConfig`; re-key the cache to
   (team, actor, state). Lazy, as today.
3. State references in `.spec.md` and `scene()` options.
4. The eager parallel phase.
5. Documentation — `guides/building-teams.md` and a reference page. The current
   feature is unused mainly because nothing points at it.

Steps 1 and 2 are independently useful: together they let an existing suite
recover the measured 143s with no spec changes at all.
