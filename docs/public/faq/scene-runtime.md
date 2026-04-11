# How the Scene Runtime Works

Markdown scenes and TypeScript scenes both run on the same scene runtime. This guide explains what that runtime actually does — how your spec turns into browser actions, how multiple actors run at the same time, and how the pieces fit together.

If you're writing specs, you don't need this guide. The Markdown format and TypeScript `scene()` API are designed so you can write specs without thinking about the runtime. But if you want to understand _why_ things work the way they do — why ordering doesn't matter, why actors don't step on each other, why `see` doubles as a scope setter — read on.

## Two Phases: Declare, Then Drain

Every scene runs in two distinct phases.

### Phase 1: Declaration

Your spec builds a queue of actions for each actor. Nothing happens in the browser yet.

```scenetest
# user updates profile

user:
- openTo /login
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- see dashboard
- click profile-link
```

When this spec is parsed (or when a `scene()` function body executes), the runtime creates an actor handle for `user` and pushes six actions onto its internal queue:

```javascript
user.queue = [
  openTo('/login'),
  typeInto('email-input', ...),
  typeInto('password-input', ...),
  click('submit-button'),
  see('dashboard'),
  click('profile-link'),
]
```

No browser has launched. No page has loaded. The spec is just data at this point.

### Phase 2: Drain

After declaration completes, the runtime launches a browser context for each actor, then **drains all queues concurrently**. Each actor walks through its queue one action at a time, advancing as fast as the DOM allows.

```text
user:  openTo → typeInto → typeInto → click → see → click
       ▸ executing...
```

Each action uses Playwright's `locator.waitFor()` under the hood. When an action targets an element that isn't visible yet, the actor pauses — Playwright polls the DOM until the element appears or `actionTimeout` expires (default: 5 seconds). When the element appears, the action completes and the actor moves to the next one.

This is the core insight: **actors don't need explicit waits because every action already waits**. `see('dashboard')` doesn't just assert — it blocks until the dashboard is visible, then moves on. If the dashboard takes 2 seconds to load, the actor waits 2 seconds. If it's already there, it resolves instantly.

## Multiple Actors

With two or more actors, the runtime drains all queues in parallel using `Promise.allSettled`. Each actor gets its own browser context and works through its own queue independently.

```scenetest
# sender sends a message and receiver sees it

sender:
- openTo /login
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- see inbox
- click compose-button
- typeInto message-body 'Hello!'
- click send-button

receiver:
- openTo /login
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- see inbox
- see message-item
- seeText 'Hello!'
```

At drain time, both actors execute simultaneously:

```text
sender:    openTo → typeInto → typeInto → click → see → click → typeInto → click
receiver:  openTo → typeInto → typeInto → click → see → see → seeText
           ▸ both executing in parallel...
```

The receiver's `see message-item` will block until a message appears in the inbox. If the sender hasn't sent it yet, the receiver just waits. When the sender clicks "send" and the message appears in the receiver's DOM, the receiver's action resolves and it moves on to `seeText`.

This is how actors synchronize **through the application** — the same way real users would. No explicit coordination needed for most cases.

### When You Do Need Explicit Coordination

Sometimes DOM state isn't enough. If the receiver needs to navigate to the inbox _after_ the sender has sent the message (not before), the DOM won't help — the receiver might load the inbox before the message exists. Use `emit` and `waitFor`:

```scenetest
sender:
- openTo /compose
- typeInto message-body 'Hello!'
- click send-button
- emit message-sent

receiver:
- waitFor message-sent
- openTo /inbox
- see message-item
- seeText 'Hello!'
```

`emit` posts a named message to a shared bus. `waitFor` blocks until that message arrives. The bus is **sticky** — if `waitFor` runs after `emit` has already fired, it resolves immediately. This prevents race conditions when declaration order doesn't match execution order.

### Failure Propagation

If any actor fails (an element never appears, an action times out), the runtime **aborts all other actors**. There's no point in continuing a multi-user scene when one participant has hit an error. The first non-abort error is reported.

## Scope

`scope` narrows the actor's current scope — subsequent actions resolve selectors relative to the scoped element, not the entire page. `see` is a pure assertion that checks visibility but does **not** change scope.

```scenetest
user:
- scope sidebar            # scope → sidebar element
- click settings-link      # looks for settings-link inside sidebar
- scope settings-panel     # scope → settings-panel (inside sidebar)
- click save-button        # looks for save-button inside settings-panel
```

Scope is managed as a stack. Each `scope` pushes the current scope onto the stack and sets the new one. You can navigate the stack with `prev` and `up`:

- **`prev`** — pops back to the previous scope (like "undo")
- **`up`** — with no argument, resets scope to the page root. With a selector, sets scope to a matching ancestor element.

```scenetest
user:
- scope sidebar
- click settings-link
- scope settings-panel
- prev                     # scope → sidebar (back one level)
- click another-link
- up                        # scope → page root
- see main-content
```

### Scope Survives Navigation (When It Can)

If the page URL changes (e.g., a client-side navigation), the runtime validates the current scope before each action. If the scoped element is still in the DOM, the scope holds. If it's gone, the runtime walks up the scope stack looking for an ancestor that still exists. If nothing survives, scope resets to the page root.

This means you don't need to manually reset scope after navigation — the runtime handles it.

## Conditional Monitors

`if()` registers a watcher that fires if a selector becomes visible during any subsequent action. It's designed for UI that _might_ appear — modals, cookie banners, onboarding prompts.

```scenetest
user:
- if welcome-modal
    click dismiss
- openTo /app
- see dashboard
- click settings
```

Here's what happens at runtime:

1. **Declaration:** The `if` line creates a conditional monitor with selector `welcome-modal` and sub-action `click dismiss`. Nothing happens in the browser.
2. **Drain:** As the actor processes `openTo`, `see`, and `click`, each action runs alongside a polling loop that checks all registered monitors every **50ms**. If `welcome-modal` becomes visible during any of those actions, the monitor fires: it pauses the current action, executes `click dismiss`, then resumes.
3. **One-shot:** Once a monitor fires, it stops polling. If the modal never appears, the monitor has zero cost beyond the polling.

`warnIf()` works similarly but doesn't intervene — it just records a warning in the scene report. Useful for flagging unexpected UI without failing the test.

For the full guide on conditional handling, see [Conditional Handling](/guides/conditional-handling).

## The Full Stack

Here's how all the pieces connect:

```text
┌─────────────────────────────────────────────────────┐
│  .spec.md file  or  scene() function                │  ← you write this
├─────────────────────────────────────────────────────┤
│  Parser / Declaration                               │
│  Builds per-actor action queues                     │
├─────────────────────────────────────────────────────┤
│  Scene Runtime                                      │
│  Launches browser contexts, drains queues           │
│  concurrently, polls conditional monitors           │
├──────────────┬──────────────┬───────────────────────┤
│  Actor 1     │  Actor 2     │  Actor N ...          │
│  queue.drain │  queue.drain │  queue.drain          │
├──────────────┴──────────────┴───────────────────────┤
│  Playwright                                         │
│  locator.waitFor(), click(), fill(), etc.           │
├─────────────────────────────────────────────────────┤
│  Browser (Chromium / Firefox / WebKit)              │
│  Your application under test                        │
└─────────────────────────────────────────────────────┘
```

Markdown scenes compile to the same internal representation as `scene()` calls. The parser converts your `.spec.md` into queued actions — the runtime doesn't know or care which format you used.

## Timing and Configuration

Two timeout settings control the runtime:

| Setting | Default | What it does |
|---------|---------|--------------|
| `actionTimeout` | 5000ms | How long each action waits for its selector before failing |
| `timeout` | 30000ms | Overall scene timeout |

There's also `warnAfter` (default: 500ms), which logs a console warning when an action has been waiting longer than expected. This helps you spot slow transitions during development without failing the test.

These are set in your `scenetest/config.ts`:

```typescript
export default defineConfig({
  baseUrl: 'http://localhost:5173',
  actionTimeout: 5000,
  timeout: 30000,
  warnAfter: 500,
})
```

## Key Takeaways

- **Specs are data.** Your Markdown or `scene()` call builds action queues. Nothing runs until the declaration phase is complete.
- **Actors drain concurrently.** Each actor works through its queue at its own pace, limited only by the DOM.
- **Every action waits.** Playwright's `waitFor` is built into every action, so explicit waits are almost never needed.
- **Actors synchronize through the app.** Most of the time, DOM state is enough. For cases where it isn't, `emit`/`waitFor` provides explicit coordination.
- **Scope flows through the queue.** `scope` narrows scope, `prev`/`up` widen it. `see` asserts visibility without changing scope. Scope is validated automatically after navigation.
- **Conditional monitors poll alongside actions.** `if()` watches every 50ms during subsequent actions. One-shot, zero cost if it doesn't fire.
