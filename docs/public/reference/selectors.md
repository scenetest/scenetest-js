# Selectors

All actor methods that accept a `selector` parameter (`see`, `click`, `typeInto`, etc.) use Scenecheck's selector resolution. Selectors are **space-separated tokens** that resolve to DOM elements.

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

If an element has a `data-key` attribute, the next token can match against it **without descending** into a child:

```typescript
testUser.click('playlist-row 12345 like-button')
// 1. Find element matching 'playlist-row'
// 2. Check if it has data-key="12345" — if yes, stay on same element
// 3. If no, look for child matching '12345'
// 4. Then find 'like-button' as a child
```

This works with markup like:

```html
<div data-testid="playlist-row" data-key="12345">
  <button aria-label="like-button">Like</button>
</div>
```

Key selectors are useful for lists where each row has a unique key.

## Sigil Prefixes

- `~name` — Alias lookup (configured in your config file)
- `@label` — Explicit aria-label match (e.g., `@Close` → `[aria-label="Close"]`)

## Aliases

Configure shorthand selectors in your config file with the `~` prefix:

```typescript
// scenecheck.config.ts
import { defineConfig } from '@scenecheck/scenes'

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
import { explainSelector } from '@scenecheck/scenes'

const result = await explainSelector(page, 'my-selector')
// {
//   found: false,
//   count: 0,
//   matches: [],
//   suggestions: ['my-selector-v2', 'my-selectors']
// }
```
