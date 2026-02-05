# Preparing Your DOM for Semantic Scenes

Scene specs target elements by **semantic names** -- not CSS classes, not DOM structure, not text content. This guide covers how to add the right attributes to your markup so that specs stay stable and readable.

## The Attributes

Scenetest's [selector resolution](/reference/selectors) matches each token against six attributes. In practice, you'll use three:

| Attribute | Use for | Example |
|-----------|---------|---------|
| `data-testid` | Static, one-of-a-kind elements | `data-testid="checkout-form"` |
| `aria-label` | Interactive elements (buttons, links, inputs) | `aria-label="close-dialog"` |
| `data-name` + `data-key` | Repeated items in a list | `data-name="language-option" data-key="fr"` |

The other three (`id`, `name`, bare `data-key`) are supported but rarely the best choice for new markup.

## Static Elements: `data-testid`

For elements that appear once on a page, `data-testid` is the default:

```tsx
<form data-testid="profile-form">
  <h2>Edit Profile</h2>
  <input data-testid="display-name-input" />
  <button data-testid="save-button">Save</button>
</form>
```

```scenetest
user:
- see profile-form
- typeInto display-name-input 'Alice'
- click save-button
```

Name by **what it represents**, not how it looks:

```tsx
// Good
<button data-testid="submit-order">Place Order</button>
<div data-testid="cart-summary">...</div>

// Bad
<button data-testid="blue-button">Place Order</button>
<div data-testid="top-div">...</div>
```

## Interactive Elements: `aria-label`

For buttons, links, and inputs, prefer `aria-label`. It does double duty -- accessible to screen readers *and* targetable by specs:

```tsx
<button aria-label="remove-item" onClick={handleRemove}>
  <TrashIcon />
</button>

<a aria-label="settings-link" href="/settings">
  <GearIcon /> Settings
</a>
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

## List Items: `data-name` + `data-key`

This is the most important pattern to get right. When you have a list of repeated elements and need to target a specific one, use `data-name` to identify the **type** and `data-key` to identify the **instance**.

Prefer:

```tsx
{languages.map(lang => (
  <div data-name="language-option" data-key={lang.value}>
    <span>{lang.label}</span>
    <button aria-label="select-language">Select</button>
  </div>
))}
```

Over:

```tsx
{languages.map(lang => (
  <div data-testid={`language-option-${lang.value}`}>
    <span>{lang.label}</span>
    <button aria-label="select-language">Select</button>
  </div>
))}
```

### Why this matters

The dynamic `data-testid` approach (`language-option-fr`, `language-option-en`) bakes the key into the attribute name. This causes problems:

1. **Specs can't separate identity from type.** With `data-testid="language-option-fr"`, a spec has to hard-code the full string. With `data-name` + `data-key`, the spec can address the item structurally:

    ```scenetest
    user:
    - click language-option fr select-language
    ```

    The selector resolver finds the element with `data-name="language-option"`, checks that it (or a child) has `data-key="fr"`, and then finds the `select-language` button inside it. Each token does one job.

2. **Variable interpolation works naturally.** When the key comes from actor config or another actor's data:

    ```scenetest
    user:
    - click language-option [self.preferred_language] select-language
    ```

    With the dynamic `data-testid` approach, you'd need string concatenation in the spec, which the text DSL doesn't support.

3. **Selector tokens stay stable.** If you rename the key from `fr` to `fra`, you update the seed data -- not the spec's selector structure. The token `language-option` never changes.

4. **Debugging is clearer.** When a selector fails, the error message shows which token couldn't be resolved. `language-option` > `fr` > `select-language` tells you exactly where the chain broke. `language-option-fr` is opaque.

### The pattern in full

```tsx
// A todo list
{todos.map(todo => (
  <li data-name="todo-item" data-key={todo.id}>
    <span>{todo.text}</span>
    <input
      type="checkbox"
      aria-label="toggle-complete"
      checked={todo.done}
      onChange={() => toggle(todo.id)}
    />
    <button aria-label="delete-todo" onClick={() => remove(todo.id)}>
      <TrashIcon />
    </button>
  </li>
))}
```

```scenetest
# user can complete and delete a todo

user:
- openTo /todos
- see todo-list
- click todo-item abc123 toggle-complete
- click todo-item def456 delete-todo
- notSee todo-item def456
```

Each token in `todo-item abc123 toggle-complete` has a clear role: **type**, **key**, **child action target**.

### Nested lists

When lists are nested, each level gets its own `data-name` + `data-key`:

```tsx
{playlists.map(pl => (
  <div data-name="playlist" data-key={pl.id}>
    <h3>{pl.name}</h3>
    {pl.tracks.map(track => (
      <div data-name="track" data-key={track.id}>
        <span>{track.title}</span>
        <button aria-label="play-track">Play</button>
      </div>
    ))}
  </div>
))}
```

```scenetest
user:
- click playlist summer-vibes track song-42 play-track
```

The resolver walks: `playlist` -> `data-key="summer-vibes"` -> `track` -> `data-key="song-42"` -> `play-track`.

## When to Use What

| Situation | Attribute | Spec selector |
|-----------|-----------|--------------|
| A form that appears once | `data-testid="login-form"` | `login-form` |
| A submit button | `aria-label="submit-login"` | `submit-login` |
| An icon-only button | `aria-label="close-dialog"` | `close-dialog` |
| A row in a list | `data-name="user-row" data-key={user.id}` | `user-row abc123` |
| A button inside a list row | `aria-label="edit-user"` (on the button) | `user-row abc123 edit-user` |
| A static section | `data-testid="sidebar"` | `sidebar` |
| A tab in a tab bar | `data-name="tab" data-key="settings"` | `tab settings` |

## Common Mistakes

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
<li data-name="item" data-key={index}>

// Do
<li data-name="item" data-key={item.id}>
```

Array indices shift when items are added or removed. Use stable identifiers.

**Skipping `data-name` on keyed elements:**

```tsx
// Don't — data-key alone has no type context
<li data-key={todo.id}>

// Do
<li data-name="todo-item" data-key={todo.id}>
```

Without `data-name`, the selector has to match on `data-key` alone, which is fragile if multiple lists on the page share key values.

## Adding Markers to an Existing Codebase

If you're adding markers to an existing codebase in bulk, see the LLM prompt in the [Getting Started guide](/guides/getting-started#4-add-semantic-dom-markers). It walks through finding selector tokens in your specs and adding the right attributes to your components.

The short version:
1. Read your spec files to find every selector token
2. Find the corresponding element in your source
3. Add `data-testid` for static elements, `aria-label` for interactive ones, `data-name` + `data-key` for list items
4. Run `pnpm scenetest` and watch specs start passing
