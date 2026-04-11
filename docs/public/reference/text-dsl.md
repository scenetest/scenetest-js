# Markdown Spec Reference

Markdown scenes are the primary way to write Scenetest specs. It's a simple line-based format for describing user journeys — human-readable, GitHub-renderable, and executable.

> New to Scenetest? Start with the [Writing Scene Specs](/guides/writing-scene-specs) guide for best practices and workflow. This page is the complete grammar reference.

## Grammar

```text
<action> [<selector>] [<value>]

Navigation:
  openTo <url>                    Navigate to URL
  reload                          Reload the current page
  goBack                          Navigate back in browser history
  goForward                       Navigate forward in browser history
  switchDevice [<name>]           Switch to a new browser context (new device)

Assertions (do NOT change scope):
  see <selector>                  Wait for element visible
  seeInView <selector>            Wait for element visible in the viewport
  notSee <selector>               Wait for element hidden
  seeText <text>                  Wait for text visible
  seeToast <selector>             Wait for element appear then disappear

Scope:
  scope <selector>                Wait for element visible and SET it as scope
  up [<selector>]                 Navigate scope to ancestor (bare up = page root)
  prev                            Return to previous scope

Interactions (resolve within current scope):
  click [<selector>]              Click element (bare click = click current scope)
  typeInto <selector> <value>     Fill input
  check <selector>                Check checkbox
  select <selector> <value>       Select dropdown option
  ifClick <selector>              Click element if visible, skip silently if not
  pressKey <key>                  Send raw keyboard event (Playwright key name)

Control:
  wait <ms>                       Wait milliseconds
  emit <message>                  Emit to message bus
  waitFor <message>               Block until bus message arrives
  warnIf <selector> <message>     Register script warning
  scrollToBottom                  Scroll current scope to bottom
```

> `do()` and `if()` are code-only methods not available in the text DSL grammar. However, `if` is available in `.spec.md` files with indented sub-actions. `ifClick` (or `if-click`) is available everywhere as a point-in-time shorthand.

`reload`, `goBack`, and `goForward` take no arguments. `switchDevice` optionally takes a device name (e.g., `switchDevice iPhone 14`). If omitted, the next device from the rotation is used.

### How actions affect scope

Every action falls into one of four categories:

| Category | Actions | What happens |
|----------|---------|--------------|
| **Sets scope** | `scope`, `up` | Narrows subsequent interactions to within the matched element. `scope` pushes onto a stack; `up` navigates to an ancestor or resets to page root. |
| **Resets scope** | `openTo`, `reload`, `goBack`, `goForward`, `switchDevice` | Clears scope entirely — back to page root. |
| **Resets scope on navigation** | `click`, `ifClick` | If the click triggers a URL change, scope resets to page root. Otherwise scope is unchanged. |
| **Does not change scope** | `see`, `seeInView`, `notSee`, `seeText`, `seeToast`, `typeInto`, `check`, `select`, `wait`, `emit`, `waitFor`, `pressKey`, `warnIf`, `scrollToBottom`, `prev` | Scope stays where it is. (`prev` pops the scope stack, returning to the previous scope.) |

**`see` vs `scope`:** `see` is a pure assertion — it checks that an element is visible but does not narrow scope. Use `scope` when you need subsequent actions (like `typeInto` or `check`) to resolve within a specific container.

**Fallback resolution:** `see`, `click`, and `scope` try the current scope first. If no match is found, they retry from the page root and log a warning. This prevents silent failures when an element exists outside the expected scope. Form interactions (`typeInto`, `check`, `select`) do **not** fall back — they resolve strictly within the current scope so you can be sure which form you're interacting with.

### Nested selectors

For actions that take both selector and value (`typeInto`, `select`, `warnIf`), the selector can be **multi-word** (nested). The **last token** is the value:

```scenetest
typeInto modal search-input hello     # selector="modal search-input", value="hello"
select form dropdown option1          # selector="form dropdown", value="option1"
```

### Quoted values

Use single or double quotes for values with spaces:

```scenetest
typeInto search-input 'hello world'           # value="hello world"
typeInto modal search-input "hello world"     # nested selector + quoted value
warnIf popup 'unexpected dialog appeared'     # multi-word warning message
```

Quotes are only needed when the value contains spaces. Single-word values don't need quotes.

For full selector syntax, see the [Selectors reference](/reference/selectors).

---

## Markdown Scene Files (.spec.md)

Write specs as **human-readable markdown** — GitHub-renderable, readable by non-engineers, and executable. The runner auto-discovers `.spec.md` files alongside `.spec.ts` files and compiles each one into `scene()` registrations.

### Example

```scenetest
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
- scope navbar notifications-badge
- click
- scope notifications-menu-expanded new-friend-request
- click

## old user re-activates account
returning-user:
- openTo /login
- see login-form
- typeInto email [self.email]
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
- `[namespace.field]` interpolates values (see Variable Interpolation below)
- `if <selector>` followed by indented lines creates a conditional monitor
- `macro-name` or `macro-name alias=role` invokes a registered macro
- `waitFor <message>` blocks the actor until a bus message arrives
- Bare `click` (no selector) clicks the current scope element
- Bare `up` (no selector) resets scope to the page root

### Cleanup and setup directives

Scenes can declare `cleanup:` and `setup:` expressions that run server-side code around the scene. Use them when a scene needs specific database state.

**Execution order:** `cleanup (before)` → `setup` → scene steps → `cleanup (after)`.

```scenetest
## review mode shows 2-buttons

cleanup: supabase.from('user_deck').update({ review_answer_mode: null }).eq('uid', '[learner.key]').eq('lang', '[team.lang]')
setup: supabase.from('user_deck').update({ review_answer_mode: '2-buttons' }).eq('uid', '[learner.key]').eq('lang', '[team.lang]')

learner:

- openTo /review
- see 2-buttons-mode
```

**Multiple directives:** You can declare multiple `cleanup:` and `setup:` lines — they are collected as an array and all execute in order:

```scenetest
cleanup: supabase.from('request_comment').delete().eq('uid', '[friend.key]')
cleanup: supabase.from('notification').delete().eq('uid', '[learner.key]')
```

### Variable interpolation

Use `[namespace.field]` to interpolate values into action lines:

```scenetest
[self.field]         # Current actor's own fields (email, username, id, etc.)
[role-name.field]    # Another actor's fields by role name
[team.field]         # Team metadata from tags (language, category, etc.)
[alias.field]        # Aliased role (from macro args)
[testStart]          # ISO 8601 timestamp captured before cleanup/setup runs
```

**Examples:**
```scenetest
alice:
- typeInto email [self.email]           # alice's own email
- see user-card [bob.key]                # nested selector: user-card narrowed by bob's key
- click [team.language]-section         # team metadata in selector
```

Variables work inside selectors for compound IDs:
```scenetest
see user-result-[target.key]             # becomes "see user-result-12345"
click language-card-[team.language]     # becomes "click language-card-spanish"
```

`[team.field]` resolves from the team's `tags` metadata defined in `defineTeam()`. `[testStart]` is a built-in token useful for scoping cleanup to rows created during the test:

```scenetest
cleanup: supabase.from('request_comment').delete().eq('uid', '[friend.key]').gte('created_at', '[testStart]')
```

### Cross-device testing in markdown

```scenetest
## notes sync across devices
user:
- openTo /notes
- typeInto note-editor 'Remember to buy milk'
- click save-button
- switchDevice iPhone 14
- openTo /notes
- seeText Remember to buy milk
```

### Multi-actor coordination in markdown

```scenetest
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

## Macros

Macros are named, reusable action sequences. Define them in TypeScript and call them from `.spec.md` files. Macros use the same `[namespace.field]` interpolation syntax as regular action lines.

### Defining macros

```typescript
import { defineMacro } from '@scenetest/scenes'

// Simple macro using [self.field] for current actor
defineMacro('login', [
  'openTo /login',
  'see login-form',
  'typeInto email [self.email]',
  'typeInto password [self.password]',
  'click submit',
  'see dashboard',
])

// Macro that uses an aliased actor
// The alias (target) is mapped when the macro is called
defineMacro('send-friend-request', [
  'openTo /friends',
  'click search',
  'typeInto search-input [target.username]',
  'see user-card-[target.key]',
  'click send-request-button',
])
```

### Calling macros in .spec.md

Invoke macros by name — any word that isn't a known DSL action is treated as a macro:

```scenetest
user:
- login
- see dashboard
```

Pass actor mappings with `alias=role` syntax — the alias becomes available in the macro:

```scenetest
primary-user:
- send-friend-request target=new-user
```

Multiple mappings work too:

```scenetest
admin:
- setup-friendship user1=alice user2=bob
```

Where the macro can reference `[user1.field]` and `[user2.field]`.
