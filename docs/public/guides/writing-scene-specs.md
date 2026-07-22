# Writing Scene Specs

> **Note:** This guide covers writing scene specs in Markdown. For TypeScript syntax, see [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic). For the complete `.spec.md` grammar, see the [Markdown Spec Reference](/reference/text-dsl).

Scene specs describe **user journeys** — the flows a person takes through your application. They live in `.spec.md` files and orchestrate browser interactions without touching component internals.

## Writing in Markdown

The Markdown format is basically JavaScript without the punctuation. You write your specs as `.spec.md` files — human-readable, GitHub-renderable, and executable:

```scenetest
// scenes/user-onboarding.spec.md
# user completes onboarding

new-user:
- openTo /
- see welcome-box
- click continue-button

best-friend:
- openTo /friends/search
- typeInto search-input [new-user.username]
- see results-box [new-user.key]
```

We recommend you start off just writing in markdown specs, and see how far you get with it. We think you'll love it (and it will look _so_ nice in your GitHub repo). If you hit a case Markdown can't express, you can drop into TypeScript — see [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic).

## Actor Methods

The `actor()` function returns an actor handle representing a user or role. Actors can navigate pages, assert visibility, interact with elements (click, type, check, select), navigate scope, coordinate with other actors via the message bus, and run custom Playwright actions. They also support conditionals and warnings.

For the complete method list including all navigation, visibility, interaction, scope, and control flow methods, see the [Markdown Spec Reference](/reference/text-dsl).

## Selectors

All selector methods support space-separated test IDs for targeting nested elements, ancestor navigation with `up()`, and alias resolution. For the full selector syntax and resolution rules, see the [Selectors Reference](/reference/selectors).

## Toast/Notification Testing

Use `seeToast` to wait for transient UI elements that appear and then disappear:

```scenetest
user:
- click save-button
- seeToast success-notification
```

`seeToast` waits for the element to appear _and then disappear_ — perfect for toast notifications that auto-dismiss.

## Expecting Console Errors

Some scenes deliberately exercise an error path — logging in with the wrong password, submitting an invalid form. The server *should* return an error there, and Scenetest would otherwise flag the resulting console error as a problem. Use `expectConsoleError` to declare it a success instead:

```scenetest
learner:
- typeInto password wrong-password
- click sign-in
- expectConsoleError Invalid login credentials
- seeText Wrong email or password
```

It waits for a browser console error (or uncaught exception) matching the pattern — a case-insensitive substring, or a `/regex/` — and **fails the scene if none appears**. Matched errors are reported as `✓ expected console error(s)` and kept out of the run's error surface. Each call claims one error, so add one line per console message the failure emits.

You can also name expected errors in `scenetest/config.ts` and reference them by domain term — handy when several specs expect the same error:

```ts
consoleErrorAliases: {
  'bad-password': 'Invalid login credentials',
}
// then in a spec:  - expectConsoleError bad-password
```

## Scope Navigation

`scope` narrows the actor's **current scope** — subsequent actions search within the matched element. `see` is a pure assertion that checks visibility but does **not** change scope.

```scenetest
user:
- scope settings-modal
- scope profile-form
- typeInto input Alice
- prev
- click close-button
```

In this example, `scope settings-modal` narrows to the modal, then `scope profile-form` narrows further to the form inside it. `prev` returns scope to `settings-modal` so `click close-button` finds the modal's close button, not one inside the form.

**`see` vs `scope`:** Use `see` when you only need to assert an element is visible. Use `scope` when you need subsequent actions to resolve within that element:

```scenetest
user:
- see welcome-banner          # just checks it's visible — scope unchanged
- scope settings-modal        # narrows scope to the modal
- typeInto search-input foo   # searches within settings-modal
```

**`click` does not change scope.** Even when a click navigates to a new URL, the scope stack is left untouched; the runtime walks up the stack to the nearest surviving ancestor before the next action. There is no need to follow a navigating click with `up` — and adding one is a common source of unnecessary churn in specs. Only use `up` when *you* want to widen scope explicitly (e.g. after `scope`-ing into a sub-region you've finished working with).

`up` with a selector navigates to an ancestor matching that selector. `up` with no selector resets scope to the page root:

```scenetest
user:
- scope nested-item
- up ~container
- click action-button
```

```scenetest
user:
- up
- see other-section
```

**Selector resolution is strict.** Every action resolves selectors against the current scope only — there's no silent fallback to the page root. If the element isn't in scope, you get a diagnostic error naming the action, the selector, and the scope. To reach something outside the current scope, widen first with `up` or `prev`. If the selector matches multiple elements in scope, the error is also strict — pick one with an Nth-element token: `click feed-item #1` (or `#2`, `#3`…).

## Conditional Handling

Use `if` to handle optional UI (modals, banners, announcements) that may or may not appear, and `warnIf` to flag unexpected paths without failing the test. See the [Conditional Handling guide](/guides/conditional-handling) for a full walkthrough of when and how to use each.

## Writing Effective Scene Specs

### Describe the User's Intent

Write specs from the user's perspective. Each scene should tell a story:

```scenetest
# user can complete checkout

customer:
- openTo /cart
- see cart-items
- click checkout-button
- see payment-form
- typeInto card-number 4242424242424242
- click pay-button
- seeText Order confirmed!
```

### Choosing the Right Attribute

Scenetest's [selector resolution](/reference/selectors) matches each token against six attributes. In practice, you'll use three:

| Attribute | Use for | Example |
|-----------|---------|---------|
| `data-testid` | One-of-a-kind elements and list containers | `data-testid="checkout-form"` |
| `aria-label` | Interactive elements (buttons, links, inputs) | `aria-label="close-dialog"` |
| `data-key` | Items inside a list container | `data-key="fr"` |

For **static elements** that appear once on a page, `data-testid` is the default. Name by **what it represents**, not how it looks:

```tsx
// Good
<button data-testid="submit-order">Place Order</button>
<div data-testid="cart-summary">...</div>

// Bad
<button data-testid="blue-button">Place Order</button>
<div data-testid="top-div">...</div>
```

For **interactive elements** (buttons, links, inputs), prefer `aria-label`. It does double duty -- accessible to screen readers *and* targetable by specs:

```tsx
<button aria-label="remove-item" onClick={handleRemove}>
  <TrashIcon />
</button>
```

The `@scenetest/eslint-plugin` includes a `prefer-aria-label` rule that flags interactive elements with `data-testid` but no `aria-label`. Enable it:

```js
// eslint.config.js
import scenetest from '@scenetest/eslint-plugin'

export default [
  scenetest.configs.recommended,
  // ... your other config
]
```

For **list items**, use the container + `data-key` pattern described in the [Selectors Reference](/reference/selectors#container--data-key-pattern).

| Situation | Attribute | Spec selector |
|-----------|-----------|--------------|
| A form that appears once | `data-testid="login-form"` | `login-form` |
| A submit button | `aria-label="submit-login"` | `submit-login` |
| An icon-only button | `aria-label="close-dialog"` | `close-dialog` |
| A list container | `data-testid="user-list"` | `user-list` |
| A row inside that list | `data-key={user.id}` | `user-list abc123` |
| A button inside a list row | `aria-label="edit-user"` (on the button) | `user-list abc123 edit-user` |
| A static section | `data-testid="sidebar"` | `sidebar` |
| Items with no container | `data-name="tab" data-key="settings"` | `tab settings` |

### Common Mistakes

**Embedding state in `data-testid`:**

```tsx
// Don't
<div data-testid={`order-${order.status}`}>  // "order-pending", "order-shipped"

// Do
<div data-testid="order-card" data-status={order.status}>
```

Specs should target `order-card`, not guess at status suffixes.

**Using index as key:**

```tsx
// Don't
<li data-key={index}>

// Do
<li data-key={item.id}>
```

Array indices shift when items are added or removed. Use stable identifiers.

**Bare `data-key` without a labeled container:**

```tsx
// Don't — data-key alone has no context
<div>
  <li data-key={todo.id}>...</li>
</div>

// Do — label the container
<div data-testid="todo-list">
  <li data-key={todo.id}>...</li>
</div>
```

Without a named container, the spec has to target `data-key` directly, which is fragile if multiple lists on the page share key values. The container gives the scope.

### Adding Markers to an Existing Codebase

If you're adding markers to an existing codebase in bulk, see the LLM prompt in the [Getting Started guide](/guides/getting-started#4-add-semantic-dom-markers). It walks through finding selector tokens in your specs and adding the right attributes to your components.

The short version:
1. Read your spec files to find every selector token
2. Find the corresponding element in your source
3. Add `data-testid` for static elements and list containers, `aria-label` for interactive elements, `data-key` for items inside a container
4. Run `npx scenetest` and watch specs start passing

## The Handoff: Reporting to Engineers

After writing scene specs, generate a report for the engineering team. This is the key collaboration point:

**Test: User Onboarding Flow**

To make these tests pass, please add the following:

1. Add `data-testid="welcome-box"` to the main welcome container
2. Add `data-testid="continue-button"` to the Continue button
3. Add `data-testid="onboarding-steps"` to the step container, and `data-key` to each step

Once these are added, the scene should start to pass.

If a test ID can't be added easily, that might indicate a UX problem worth solving!

## The Collaboration Loop

Scenetest creates a natural workflow between test writers and engineers:

1. **Test Writer**: Writes scene specs describing user journeys in plain language
2. **Test Writer**: Generates a report listing needed test IDs
3. **Engineer**: Adds test IDs to components
4. **Engineer**: Optionally adds inline assertions for internal state verification
5. **Tests**: Pass automatically when IDs are in place
6. **Both**: Iterate on edge cases and new flows

This separation means:
- Test writers don't need to know React/Vue/Solid internals
- Engineers don't need to understand test orchestration
- The test IDs become a contract between the two roles

## Configuration

For configuration, see the [guides overview](/guides).

## Cleanup and Setup Directives

Markdown scenes can declare `cleanup:` and `setup:` expressions for managing database state around a scene. These run server-side before and after scene steps.

**Execution order:** `cleanup (before)` → `setup` → scene steps → `cleanup (after)`.

```scenetest
## review mode shows 2-buttons

cleanup: supabase.from('user_deck').update({ review_answer_mode: null }).eq('uid', '[learner.key]')
setup: supabase.from('user_deck').update({ review_answer_mode: '2-buttons' }).eq('uid', '[learner.key]')

learner:
- openTo /review
- see 2-buttons-mode
```

Multiple `cleanup:` and `setup:` lines are supported — all execute in order. Use `[team.field]` to interpolate team metadata (from `tags` in `defineTeam()`), and `[testStart]` to scope cleanup to rows created during the test.

For the full syntax, see the [Markdown Spec Reference](/reference/text-dsl#cleanup-and-setup-directives).

## Summary

- Scene specs describe **user journeys** — write them as `.spec.md` Markdown files
- Write specs in **plain language** from the user's perspective
- For TypeScript syntax when you need it, see [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic)
- Use stable `data-testid` attributes on containers, `data-key` on list items, and `aria-label` on interactive elements as the contract with engineers
- Use `scope` to narrow context, `see` to assert visibility without changing scope
- Use **scope navigation** (`scope`, `prev`, `up`, bare `up`) to move between scoped contexts
- Use `seeInView` to check viewport visibility without scrolling
- Use bare `click` to click the current scope element
- Use `seeToast` for transient notifications
- Use `expectConsoleError` when a scene deliberately triggers a server/console error (e.g. a wrong-password login)
- Use `pressKey` to send raw keyboard events (`Escape`, `Enter`, `Tab`, etc.)
- Use `cleanup:` and `setup:` directives in markdown specs for database state management
- Use `if` for conditional handling, `ifClick` to dismiss optional elements, and `warnIf` for flagging unexpected paths
- Generate **handoff reports** listing needed test IDs
- Let the collaboration loop guide development

For the complete list of actor methods, see the [Markdown Spec Reference](/reference/text-dsl). For selector syntax, see the [Selectors Reference](/reference/selectors). For configuration options, see the [guides overview](/guides).
