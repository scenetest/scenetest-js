# Conditional Handling

Real applications have UI that doesn't always appear. A welcome modal shows up on first login but not on repeat visits. A cookie banner depends on region. A feature announcement rolls out to 50% of users. Your test script can't predict whether these will show up, but it needs to handle them if they do.

`if()` and `warnIf()` are the tools for this. They both watch for a selector during the actor's actions, but respond differently: `if()` intervenes (clicks a dismiss button, fills a form), while `warnIf()` just records a note.

## if() — Handle It If It Appears

`if()` registers a **conditional monitor**. You give it a selector and a set of actions. If that selector becomes visible while the actor is doing something else, the monitor fires: it pauses the current action, runs the sub-actions, then resumes.

```typescript [concurrent]
scene('user reaches dashboard', ({ actor }) => {
  const user = actor('user')

  user.openTo('/app')

  // If a welcome modal pops up at any point, dismiss it
  user.if('welcome-modal', a => a.click('dismiss'))

  user.see('dashboard')
  user.see('sidebar').click('settings')
})
```

```typescript [classic driver]
test('user reaches dashboard', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/app')

  // If a welcome modal pops up during the next action, dismiss it
  user.if('welcome-modal', async () => {
    await user.click('dismiss')
  })

  await user.see('dashboard')
})
```

```scenetest [markdown]
# user reaches dashboard

user:
- openTo /app
- if welcome-modal
    click dismiss
- see dashboard
- see sidebar
- click settings
```

### What happens at runtime

There are two phases: **declaration** (when your script runs) and **drain** (when the browser acts).

**Declaration:** When the runner hits `user.if('welcome-modal', ...)`, nothing happens in the browser. The callback runs immediately, but the actor's internal queue is temporarily redirected — so `a.click('dismiss')` pushes to a *separate sub-action list* attached to the monitor, not to the actor's main queue. Your main action sequence is unaffected.

**Drain:** As the actor works through its queue (`see('dashboard')`, `click('settings')`, etc.), each action begins with a **synchronous pre-check** of all pending conditional monitors. If the selector is already visible when the action starts, the monitor fires immediately — the sub-actions execute before the main action begins. If not already visible, a polling loop runs alongside the action, checking every 50ms. The monitor is **one-shot**: once it fires, it stops polling. If the modal never appears, the monitor never fires and has zero cost beyond the polling.

> **v0.4.0:** The pre-check was added to handle elements that are already visible when the action starts (e.g. a localStorage-gated intro dialog). Previously, `if` only detected elements appearing *during* the polling window.

### When does it poll?

The monitor watches during **every action that comes after it** in the actor's queue. It doesn't watch retroactively — only actions declared after the `if()` call are monitored. This is why you typically declare `if()` early, before the actions where the optional UI might appear.

### Lifecycle difference between models

In the **concurrent model** (`scene()`), the monitor is persistent — it polls during every subsequent action until it fires or the scene ends.

In the **classic driver** (`test()`), watchers are cleared after each `await`. So `if()` only watches during the *immediately next* awaited action. If you need it to watch across multiple actions, re-register it.

For a full side-by-side comparison, see the [Concurrent and Classic Mode reference](/reference/concurrent-and-classic#conditional-monitors-if).

## warnIf() — Flag It, Don't Fix It

Sometimes you don't want to handle the optional UI — you want to know it appeared. `warnIf()` records a warning but doesn't intervene:

```typescript [concurrent]
scene('returning user sees dashboard', ({ actor }) => {
  const user = actor('user')

  // This user's seed data has dismiss_welcome=true,
  // so the modal shouldn't appear. Warn if it does.
  user.warnIf('welcome-modal', 'user should have dismiss flag set')

  user.openTo('/app')
  user.see('dashboard')
})
```

```typescript [classic driver]
test('returning user sees dashboard', async ({ actor }) => {
  const user = await actor('user')

  user.warnIf('welcome-modal', 'user should have dismiss flag set')

  await user.openTo('/app')
  await user.see('dashboard')
})
```

Unlike `if()`, warnings **persist for the entire scene** in both models. They're recorded in `SceneReport.warnings` and show up in reports, but they don't fail the test.

Warnings are useful for:
- **Seed data issues** — a user that shouldn't see onboarding is seeing it
- **A/B test monitoring** — tracking which variant an actor hit
- **Deprecation paths** — flagging when old UI surfaces unexpectedly

## Choosing Between if() and warnIf()

| Situation | Use | Why |
|-----------|-----|-----|
| Modal that must be dismissed to proceed | `if()` | The test will hang without intervention |
| Cookie banner that blocks interaction | `if()` | Need to clear it to reach the UI underneath |
| Onboarding flow that shouldn't appear for this user | `warnIf()` | Test still passes, but you want to know |
| Feature flag variant you want to track | `warnIf()` | Informational, not actionable |
| Error toast that indicates a real bug | Neither | Use `notSee('error-toast')` — this should fail the test |

## Tips

- **Declare `if()` early.** It only monitors actions that come *after* it in the queue. Put it before the actions where the optional UI might appear.
- **Keep sub-actions short.** A monitor fires inline during another action. A single `click('dismiss')` or `click('accept')` is ideal. Don't put a multi-step flow inside a monitor.
- **One-shot is usually right.** Monitors fire once and stop. If the same element keeps reappearing, that's likely a bug in the app, not something to handle silently.
- **`warnIf()` is cheap.** Sprinkle warnings for anything that *shouldn't* happen but *might*. They cost nothing when the selector doesn't match.
