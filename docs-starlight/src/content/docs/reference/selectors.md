---
title: Selectors
description: How selectors resolve to DOM elements with attribute matching, nested selectors, key selectors, aliases, and sigil prefixes.
---

# Selectors

All actor methods that accept a `selector` parameter (`see`, `click`, `typeInto`, etc.) use Scenetest's selector resolution. Selectors are **space-separated tokens** that resolve to DOM elements.

## Attribute Matching

Each token matches against these attributes simultaneously:

- `aria-label`
- `id`
- `data-testid`
- `data-name`
- `data-key`
- `name`

If multiple elements match (each via a different attribute), the first one in **DOM order** wins. In practice, `data-testid` is the primary convention for scene specs.

```typescript
testUser.see('login-form')
// Finds the first element with any of:
//   aria-label="login-form"
//   id="login-form"
//   data-testid="login-form"
//   data-name="login-form"
//   data-key="login-form"
//   name="login-form"
```

## Nested Selectors

Space-separated tokens drill into the DOM. Each token finds a descendant of the previous match:

```typescript
testUser.see('sidebar nav-menu settings-link')
// Finds: [sidebar] > ... > [nav-menu] > ... > [settings-link]
```

## Key Selectors

When a token matches an element whose **child** has a `data-key`, the next token resolves against that key — narrowing to a specific item without an extra nesting level:

```typescript
testUser.click('playlist like-button')
// 1. Find element matching 'playlist'
// 2. Find descendant matching 'like-button'

testUser.click('playlist 12345 like-button')
// 1. Find element matching 'playlist'
// 2. Find child with data-key="12345"
// 3. Find 'like-button' inside that child
```

This works with markup like:

```html
<ul data-testid="playlist">
  <li data-key="12345">
    <span>Track name</span>
    <button aria-label="like-button">Like</button>
  </li>
  <li data-key="67890">
    <span>Another track</span>
    <button aria-label="like-button">Like</button>
  </li>
</ul>
```

The key token (`12345`) scopes the search to the matching list item, so `like-button` resolves to the correct one.

### Container + `data-key` Pattern

The most important pattern for lists: put `data-testid` on the **container** and `data-key` on each **item**.

Prefer:

```tsx
<ul data-testid="language-options">
  {languages.map(lang => (
    <li data-key={lang.value}>
      <span>{lang.label}</span>
      <button aria-label="select-language">Select</button>
    </li>
  ))}
</ul>
```

Over dynamic `data-testid` values like `data-testid={`language-option-${lang.value}`}`. The dynamic approach bakes the key into the attribute name, which causes problems:

1. **Specs can't separate identity from key.** With container + `data-key`, the spec addresses the item structurally:

    ```text
    user:
    - click language-options fr select-language
    ```

    The selector resolver finds the container via `data-testid="language-options"`, descends to the child with `data-key="fr"`, and then finds `select-language` inside it. Each token does one job.

2. **Variable interpolation works naturally.** When the key comes from actor config or another actor's data:

    ```text
    user:
    - click language-options [self.preferred_language] select-language
    ```

    With dynamic `data-testid`, you'd need string concatenation in the spec, which the text DSL doesn't support.

3. **Selector tokens stay stable.** If you rename the key from `fr` to `fra`, you update the seed data -- not the spec's selector structure. The container token `language-options` never changes.

4. **Debugging is clearer.** When a selector fails, the error message shows which token couldn't be resolved. `language-options` > `fr` > `select-language` tells you exactly where the chain broke. `language-option-fr` is opaque.

Here's the pattern in full with a todo list:

```tsx
<ul data-testid="todo-list">
  {todos.map(todo => (
    <li data-key={todo.id}>
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
</ul>
```

```text
# user can complete and delete a todo

user:
- openTo /todos
- see todo-list
- click todo-list abc123 toggle-complete
- click todo-list def456 delete-todo
- notSee todo-list def456
```

Each token in `todo-list abc123 toggle-complete` has a clear role: **container**, **key**, **child action target**.

### Nested Lists

When lists are nested, each level gets its own container `data-testid` and item `data-key`:

```tsx
<div data-testid="playlist-browser">
  {playlists.map(pl => (
    <div data-key={pl.id}>
      <h3>{pl.name}</h3>
      <ul data-testid="track-list">
        {pl.tracks.map(track => (
          <li data-key={track.id}>
            <span>{track.title}</span>
            <button aria-label="play-track">Play</button>
          </li>
        ))}
      </ul>
    </div>
  ))}
</div>
```

```text
user:
- click playlist-browser summer-vibes track-list song-42 play-track
```

The resolver walks: `playlist-browser` -> `data-key="summer-vibes"` -> `track-list` -> `data-key="song-42"` -> `play-track`.

### When There's No Natural Container

If items appear without a clear wrapper element, you can use `data-name` on the items themselves as a fallback. `data-name` acts like an inline type label:

```tsx
{tabs.map(tab => (
  <button data-name="tab" data-key={tab.id} onClick={() => select(tab.id)}>
    {tab.label}
  </button>
))}
```

```text
user:
- click tab settings
```

Prefer a container with `data-testid` when one exists. Use `data-name` + `data-key` on items only when the DOM structure doesn't have a natural wrapper to label.

## Sigil Prefixes

- `~name` — Alias lookup (configured in your config file)
- `@label` — Explicit aria-label match (e.g., `@Close` → `[aria-label="Close"]`)

## Aliases

Configure shorthand selectors in your config file with the `~` prefix:

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  aliases: {
    modal: 'div[role=dialog]',
    nav: '[role=navigation]',
    container: '.@container, [data-container]',
    'btn-p': 'button[type=submit], button.primary',
  },
})
```

Use them in any selector:

```typescript
testUser.see('~modal')               // matches [role=dialog]
testUser.click('~modal ~btn-p')      // matches submit button inside dialog
testUser.up('~container')            // navigate up to alias-matched ancestor
```

## Debugging with explainSelector

When a selector fails to match, use `explainSelector()` to debug:

```typescript
import { explainSelector } from '@scenetest/scenes'

const result = await explainSelector(page, 'my-selector')
// {
//   found: false,
//   count: 0,
//   matches: [],
//   suggestions: ['my-selector-v2', 'my-selectors']
// }
```
