# Text DSL Format

The text DSL lets you write scene actions as plain strings — useful for simple flows, non-engineer-authored specs, code generation, and natural-language-to-test pipelines.

There are two ways to use the text DSL:

1. **Markdown scene files** (`.spec.md`) — standalone files that compile to `scene()` registrations
2. **`dsl()` method** — inline multiline strings on actor handles

## Grammar

```
<action> [<selector>] [<value>]

Actions:
  openTo <url>                    Navigate to URL
  see <selector>                  Wait for element visible (updates scope)
  seeInView <selector>            Wait for element visible in the viewport
  notSee <selector>               Wait for element hidden
  seeText <text>                  Wait for text visible
  seeToast <selector>             Wait for element appear then disappear
  click [<selector>]              Click element within scope (bare click = click current scope)
  typeInto <selector> <value>     Fill input
  check <selector>                Check checkbox
  select <selector> <value>       Select dropdown option
  wait <ms>                       Wait milliseconds
  emit <message>                  Emit to message bus
  waitFor <message>               Block until bus message arrives
  warnIf <selector> <message>     Register script warning
  up [<selector>]                 Navigate scope to ancestor (bare up = reset to page root)
  prev                            Return to previous scope
  scrollToBottom                  Scroll current scope to bottom
```

> `do()` and `if()` are code-only methods not available in the text DSL grammar. However, `if` is available in `.spec.md` files with indented sub-actions.

### Nested selectors

For actions that take both selector and value (`typeInto`, `select`, `warnIf`), the selector can be **multi-word** (nested). The **last token** is the value:

```
typeInto modal search-input hello     # selector="modal search-input", value="hello"
select form dropdown option1          # selector="form dropdown", value="option1"
```

### Quoted values

Use single or double quotes for values with spaces:

```
typeInto search-input 'hello world'           # value="hello world"
typeInto modal search-input "hello world"     # nested selector + quoted value
warnIf popup 'unexpected dialog appeared'     # multi-word warning message
```

Quotes are only needed when the value contains spaces. Single-word values don't need quotes.

For full selector syntax, see the [Selectors reference](/reference/selectors).

---

## Markdown Scene Files (.spec.md)

Write specs as **human-readable markdown** — GitHub-renderable, readable by non-engineers, and executable. The runner auto-discovers `.spec.md` files alongside `.spec.ts` files and compiles each one into `scene()` (declarative) registrations.

### Example

```markdown
# User friend requests

## new user signs up and gets a friend request
new-user:
- openTo /
- see welcome-box
- click continue-button

primary-user:
- openTo /friends
- click main-navbar search
- typeInto search-input [new-user.username]
- see search-results-section
- click friend-request-button

new-user:
- seeToast friend-request
- see navbar notifications-badge
- click
- see notifications-menu-expanded new-friend-request
- click

## old user re-activates account
returning-user:
- openTo /login
- see login-form
- typeInto email [returning-user.email]
- click submit
```

### Format rules

- `#` headings are **group names** (optional hierarchy)
- `##` headings are **scene names** (each becomes a `scene()` registration)
- If no `##` headings exist, `#` headings are promoted to scene names
- `role-name:` switches the active actor for subsequent lines (screenplay-cue syntax). `role-name: action args` is also supported as an inline shorthand
- Action lines use the text DSL grammar above
- Lines may start with `- ` or `1. ` — markdown list prefixes are stripped for readability
- `// comment` lines become `console.log` during execution
- `[actor.field]` interpolates actor config values (username, email, etc.)
- `if <selector>` followed by indented lines creates a conditional monitor
- `macro-name` or `macro-name role <actor> team <team>` invokes a registered macro
- `waitFor <message>` blocks the actor until a bus message arrives
- Bare `click` (no selector) clicks the current scope element
- Bare `up` (no selector) resets scope to the page root

### Multi-actor coordination in markdown

```markdown
# sender and receiver exchange messages
sender:
- openTo /login
- // log in and compose
- see login-form
- typeInto email [sender.email]
- typeInto password [sender.password]
- click submit
- see compose
- typeInto body Hello!
- click send
- emit sender-ready

receiver:
- waitFor sender-ready
- openTo /inbox
- seeText New message
```

---

## Inline `dsl()` Method

Both declarative and classic driver actors have a `dsl()` method that accepts a multiline string:

```ts [Declarative (ts)]
import { scene } from '@scenetest/cli'

scene('onboarding flow', ({ actor }) => {
  const user = actor('user')

  user.dsl(`
    openTo /
    see welcome-box
    click continue-button
    see onboarding-step
    typeInto name-input Alice
    click finish-button
  `)

  user.see('dashboard')
})
```

```ts [Classic Driver (ts)]
import { test } from '@scenetest/cli'

test('onboarding flow', async ({ actor }) => {
  const user = await actor('user')

  await user.dsl(`
    openTo /
    see welcome-box
    click continue-button
    see onboarding-step
    typeInto name-input Alice
    click finish-button
  `)

  await user.see('dashboard')
})
```

`dsl()` returns the actor (declarative) or an `ActionChain` (classic driver), so it chains with other methods:

```typescript
// declarative model — all chaining, no await
user
  .openTo('/login')
  .dsl(`
    see login-form
    typeInto email alice@test.com
    typeInto password secret
    click submit
  `)
  .see('dashboard')
```

---

## Macros

Macros are named, reusable action sequences with variable substitution. Define them in TypeScript and call them from `.spec.md` files.

### Defining macros

```typescript
import { defineMacro } from '@scenetest/cli'

defineMacro('login', [
  'openTo /login',
  'see login-form',
  'typeInto email {{email}}',
  'typeInto password {{password}}',
  'click submit',
  'see dashboard',
])

// Macro that uses another actor's fields
// Template vars are named after the role passed in the call
defineMacro('send-friend-request', [
  'openTo /friends',
  'click search',
  'typeInto search-input {{new-user.username}}',
  'click send-request-button',
])
```

### Calling macros in .spec.md

Invoke macros by name — any word that isn't a known DSL action is treated as a macro:

```markdown
user:
- login
- see dashboard
```

Pass actors to macros with the `role` keyword — their fields become template variables:

```markdown
primary-user:
- send-friend-request role new-user
```

Pass team references with the `team` keyword:

```markdown
user:
- signup-to-language team language-focus
```

### Calling macros in TypeScript

Use `runMacro()` for programmatic macro invocation:

```typescript
import { runMacro } from '@scenetest/cli'

// Works with both declarative and classic driver actors
await runMacro(user, 'login', { email: 'alice@test.com', password: 'secret' })
```
