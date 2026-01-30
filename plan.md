# Implementation Plan

Two changes to ship before the API solidifies:

1. Rename `assert` → `serverCheck`
2. Add `waitFor` to classic driver, remove `when`

---

## 1. Rename `assert` → `serverCheck`

**Why:** `assert` collides with Node's built-in `assert` module and reads like a
test-framework assertion. `serverCheck` communicates what it actually does — run a
check function on the server with browser-collected data.

### Files to change

#### Core package (`packages/scenetest/src/`)

| File | Change |
|------|--------|
| `assertions.ts:171` | Rename `export function assert` → `export function serverCheck` |
| `assertions.ts:151-169` | Update JSDoc: all `assert(` → `serverCheck(` |
| `assertions.ts:1` | Rename `AssertServerFn` → `ServerCheckFn`, `AssertDataFn` → `ServerCheckDataFn` in import |
| `types.ts:26-29` | Rename `AssertServerFn` → `ServerCheckFn` |
| `types.ts:34` | Rename `AssertDataFn` → `ServerCheckDataFn` |
| `types.ts:47-56` | Rename `AssertionRpcPayload` → `ServerCheckRpcPayload` |
| `types.ts:61-68` | Rename `AssertionRpcResponse` → `ServerCheckRpcResponse` |
| `types.ts:19` | Rename `assertionId` → `serverCheckId` |
| `index.ts:1` | Rename `assert` → `serverCheck` in export |
| `index.ts:2-10` | Rename exported types: `AssertServerFn` → `ServerCheckFn`, `AssertDataFn` → `ServerCheckDataFn`, `AssertionRpcPayload` → `ServerCheckRpcPayload`, `AssertionRpcResponse` → `ServerCheckRpcResponse` |
| `runtime.ts` | Update `__scenetest_rpc` to use renamed types. Rename any internal references to "assert" in variable names/comments |

> **Note:** Keep `AssertionResult` as-is — it describes inline assertion results
> from `should()`/`failed()`, not server checks. Same for `ScenetestReporter`.

#### Framework bindings

Each of these re-exports `assert` from `@scenetest/core`:

| File | Change |
|------|--------|
| `packages/scenetest-react/src/index.ts:5` | `assert` → `serverCheck` |
| `packages/scenetest-vue/src/index.ts:5` | `assert` → `serverCheck` |
| `packages/scenetest-solid/src/index.ts:5` | `assert` → `serverCheck` |
| `packages/scenetest-svelte/src/index.ts:5` | `assert` → `serverCheck` |

Also check each binding's hooks file for JSDoc examples mentioning `assert()`.

#### Vite plugin (`packages/vite-plugin/src/`)

| File | Lines | Change |
|------|-------|--------|
| `transform.ts:62+` | `transformAssertions` → `transformServerChecks`. Update all internal references: find `assert` import detection, change matched name from `'assert'` to `'serverCheck'` |
| `transform.ts:121-139` | First pass looks for `assert` import — change to `serverCheck` |
| `transform.ts:151` | Call-site detection: check for `serverCheck()` instead of `assert()` |
| `transform.ts:225-226` | Import injection still uses `__scenetest_rpc` — no change needed (internal name) |
| `virtual-module.ts` | Rename `ExtractedAssertion` type or leave as internal (it's not exported). Update comments |
| `middleware.ts:2` | Update imported type names |
| `middleware.ts:113-115` | Route stays `/__scenetest/run` (internal URL, no user-facing change) |
| `middleware.ts` comments | Update JSDoc references from `assert()` to `serverCheck()` |
| `index.ts:236-275` | Update `transformAssertions` call to `transformServerChecks` |
| `config.ts` | Update type import names |
| `strip.ts` | Update package detection — the strip transform removes `serverCheck` calls now instead of `assert` calls |

#### Tests

| File | Change |
|------|--------|
| `packages/vite-plugin/src/__tests__/virtual-module.test.ts` | Update test descriptions and any `assert()` call examples |
| Any `transform.test.ts` if it exists | Update `assert()` → `serverCheck()` in test source strings |

#### Example apps

| File | Change |
|------|--------|
| `packages/example-app-react/src/App.tsx:39-46` | `assert(` → `serverCheck(` |
| `packages/example-app-react/src/scenetest.d.ts` | Keep `ServerContext` augmentation (unchanged), update any comments |

#### Documentation

| File | Change |
|------|--------|
| `docs/public/design/server-actions.md` | All `assert()` → `serverCheck()`. Update type names in examples |
| `docs/public/design/plan.md` | Update Phase 1 references |
| `docs/public/guides/writing-inline-assertions.md:104-130` | Update examples |
| `docs/app/routes/index.tsx:73,173,255` | Update call sites |
| `CLAUDE.md` | Update references in "What's Not Yet Implemented" table and key source files section |
| `README.md` | Check for any `assert()` examples |

#### Execution order

1. Rename types in `packages/scenetest/src/types.ts`
2. Rename function in `packages/scenetest/src/assertions.ts`
3. Update `packages/scenetest/src/index.ts` exports
4. Update `packages/scenetest/src/runtime.ts`
5. Update all four framework binding re-exports
6. Update vite plugin: `transform.ts`, `strip.ts`, `middleware.ts`, `virtual-module.ts`, `index.ts`, `config.ts`
7. Update tests
8. Update example apps
9. Update docs (server-actions.md, CLAUDE.md, writing-inline-assertions.md, etc.)
10. `pnpm typecheck` — fix any remaining references
11. `pnpm -r test` — verify all tests pass

---

## 2. Add `waitFor` to classic driver, remove `when`

**Why:** Both execution models use the same `MessageBus` underneath. Currently:
- Concurrent model (`scene()`): actors have `.waitFor(message)` as a chainable method
- Classic driver (`test()`): uses top-level `when(trigger, action)` — a different API shape

Unifying on `waitFor` means:
- One coordination API across both models
- `waitFor` composes naturally with `emit` (both are actor methods)
- Text DSL `waitFor` command works in both models (currently gated to concurrent only)
- `when()` — a global function with an overloaded signature — goes away

### What `when` does today

```typescript
// scene.ts — exported, only works inside test() scenes
when(trigger: string, action: () => Promise<void>)  // wait for message, then run action
when(trigger: () => Promise<void>, action: string)   // run trigger, then emit message
```

It's a fire-and-forget detached promise. The replacement pattern with `waitFor`:

```typescript
// Before (when)
when('request-sent', () => receiver.see('notification'))

// After (waitFor on chain)
await receiver.waitFor('request-sent').see('notification')
```

The second `when` overload (function trigger → string action) was syntactic sugar for
"after this action completes, emit that message." The replacement:

```typescript
// Before
when(() => sender.click('send'), 'request-sent')

// After
await sender.click('send').emit('request-sent')
```

Both replacements are more explicit and compose with the chain.

### Files to change

#### Add `waitFor` to `ActionChainImpl` (`packages/scenetest-cli/src/actor.ts`)

Add after `emit()` (line ~201):

```typescript
waitFor(message: string): ActionChain {
  return this.addAction('waitFor', message, async () => {
    await this.bus.waitFor(message)
  })
}
```

This queues a `waitFor` on the chain. When the chain drains (on `await`), it blocks
until the message arrives on the bus. Since messages are sticky, if the message was
already emitted, it resolves immediately.

#### Add `waitFor` to `SequentialActorHandleImpl` (`packages/scenetest-cli/src/actor.ts`)

Add after `emit()` (line ~547):

```typescript
waitFor(message: string): ActionChain {
  return this.createChain().waitFor(message)
}
```

#### Update `ActionChain` interface (`packages/scenetest-cli/src/types.ts`)

Add after `emit(message: string): ActionChain` (line ~535):

```typescript
/** Block chain execution until a message arrives on the bus */
waitFor(message: string): ActionChain
```

#### Update `SequentialActorHandle` interface (`packages/scenetest-cli/src/types.ts`)

Add after `emit(message: string): ActionChain` (line ~422):

```typescript
/** Block until a message arrives on the bus, then continue the chain */
waitFor(message: string): ActionChain
```

#### Update `DslTarget` (`packages/scenetest-cli/src/types.ts:619`)

Make `waitFor` required (remove `?`):

```typescript
// Before
waitFor?(message: string): unknown

// After
waitFor(message: string): unknown
```

#### Update DSL parser (`packages/scenetest-cli/src/dsl.ts:261-264`)

Remove the flow-only guard:

```typescript
// Before
case 'waitFor':
  if (!value) throw new Error('waitFor requires a message')
  if (!target.waitFor) throw new Error('waitFor is only available in flow() / .spec.md scenes')
  target.waitFor(value)

// After
case 'waitFor':
  if (!value) throw new Error('waitFor requires a message')
  target.waitFor(value)
```

#### Remove `when` from `message-bus.ts` (lines 83-121)

Delete the `when()` function export. The `MessageBus` class and its `waitFor` method
stay as-is.

#### Remove `when` from `scene.ts` (lines 46-85)

Delete:
- `currentSession` variable and `setCurrentSession`/`getCurrentSession` helpers
- The `when()` export function

**Wait** — `currentSession` is also used by `runScene()` (line 106) and by `flow()` in
`reactive.ts` via `getCurrentSession()`. Check whether `getCurrentSession()` is used
elsewhere before removing it. If `reactive.ts` needs it, keep the session tracking but
remove only `when()`.

#### Update `scene.ts` `runScene()` (lines 90-151)

Keep `setCurrentSession` / `getCurrentSession` if reactive.ts needs them. Only remove
the `when()` function and its `whenImpl` import.

#### Update exports (`packages/scenetest-cli/src/index.ts:2`)

```typescript
// Before
export { scene, when } from './scene.js'

// After
export { scene } from './scene.js'
```

Remove `when` from the public API.

#### Update docs

| File | Change |
|------|--------|
| `docs/public/reference/actor-api.md:397-425` | Remove `when()` section. Add `waitFor()` to classic driver methods |
| `docs/public/reference/concurrent-and-classic.md` | Update comparison table — `waitFor` now available in both |
| `docs/public/faq/concurrent-vs-classic.md` | Update coordination examples |
| `docs/public/design/scene-vs-flow.md` | Update coordination discussion |
| `docs/public/design/writing-tests.md` | Update coordination examples if present |
| `CLAUDE.md` | Remove `when()` from `scene.ts` description. Add `waitFor` to classic driver methods |

#### Update example specs

Any `.spec.ts` files using `when()` need rewriting to use `waitFor` chains.

#### Execution order

1. Add `waitFor` to `ActionChain` and `SequentialActorHandle` interfaces in `types.ts`
2. Make `DslTarget.waitFor` required in `types.ts`
3. Implement `waitFor` in `ActionChainImpl` in `actor.ts`
4. Implement `waitFor` in `SequentialActorHandleImpl` in `actor.ts`
5. Remove flow-only guard in `dsl.ts`
6. Remove `when()` from `message-bus.ts`
7. Remove `when()` export from `scene.ts` (keep session tracking)
8. Update `index.ts` — remove `when` export
9. Update docs
10. `pnpm typecheck` — fix remaining references
11. `pnpm -r test` — verify all tests pass

---

## Verification

After both changes:

```bash
pnpm typecheck        # Zero errors
pnpm -r test          # All tests pass
pnpm build            # Clean build
```

Grep for stragglers:

```bash
# Should find zero hits outside of plan.md and git history
grep -r "when(" packages/scenetest-cli/src/ --include="*.ts" | grep -v test | grep -v plan
grep -r "\bassert\b" packages/scenetest/src/ --include="*.ts" | grep -v Assertio
```
