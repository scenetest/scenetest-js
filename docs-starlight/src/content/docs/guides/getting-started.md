---
title: Getting Started
description: Simple steps for setting up your first actors, scenes and checks, converting old specs, and more.
---

# Getting Started

This guide walks you through adding Scenetest to an existing Vite project. By the end you'll have inline checks running inside your components, a markdown scene spec driving a browser, and semantic DOM markers that make your whole test surface easy to target.

## 1. Install and Set Up

Install the three Scenetest packages. Pick the one that matches your framework:

```bash
# React
pnpm add -D @scenetest/checks-react @scenetest/vite-plugin @scenetest/scenes

# Vue
pnpm add -D @scenetest/checks-vue @scenetest/vite-plugin @scenetest/scenes

# Solid
pnpm add -D @scenetest/checks-solid @scenetest/vite-plugin @scenetest/scenes

# Svelte
pnpm add -D @scenetest/checks-svelte @scenetest/vite-plugin @scenetest/scenes
```

Add the Vite plugin:

```typescript
// vite.config.ts
import scenetest from '@scenetest/vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or your framework's plugin

export default defineConfig({
  plugins: [react(), scenetest()],
})
```

Create the Scenetest directory and config:

```bash
npx scenetest init
```

This creates the `scenetest/` folder with config, scenes, and actors:

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
})
```

Your project should now look like this:

```
your-project/
├── scenetest/
│   ├── config.ts
│   ├── actors/           # one file per actor team
│   └── scenes/           # your specs will go here
├── vite.config.ts
├── src/
│   └── ...
```

Start your dev server. You should see a small floating panel in the corner of your app -- that's the Scenetest observer. It collects assertion results in real time. Nothing to report yet, so let's give it something.

## 2. Add Your First Inline Check

Inline checks are `should()` and `failed()` calls that you place directly in your application code. They run every time the component renders (or the callback fires, or the effect runs) and report to the observer panel.

Here's the simplest possible check. Pick a component that receives data and add a `should()`:

```tsx
// src/components/UserProfile.tsx
import { should } from '@scenetest/checks-react'

function UserProfile({ user }) {
  should('user should be loaded', user !== undefined)

  return (
    <div data-testid="user-profile">
      <h1>{user.displayName}</h1>
    </div>
  )
}
```

That's it. Open your app, navigate to a page that renders this component, and watch the observer panel light up. Green if the condition is true, red if it isn't.

`should(description, condition, context?)` is for things that should be true. `failed(description, context?)` is for code paths that should never execute:

```tsx
if (items.some(item => item.price < 0)) {
  failed('found item with negative price', { items })
}
```

### Checking inside callbacks

The real power of inline checks shows up in your mutation callbacks, effects, and event handlers -- the places where external test frameworks can't easily reach. For example, inside an `onSettled` callback after a mutation:

```tsx
import { should } from '@scenetest/checks-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

function EditPostForm({ post }) {
  const queryClient = useQueryClient()
  const updatePost = useMutation({
    mutationFn: (data) => api.updatePost(post.id, data),
    onSettled: (returnData, error) => {
      if (error) return
      const cached = queryClient.getQueryData(['post', post.id])

      should('return data should be newer than original',
        returnData.updated_at > post.updated_at
      )
      should('cache should reflect the update',
        cached?.updated_at === returnData.updated_at,
        { cached, returnData }
      )
    },
  })

  return <form>...</form>
}
```

By the time `onSettled` fires, the mutation is done, `onSuccess` has run, and the cache has been updated. If these values don't match, something is broken -- even if the DOM looks fine. This is exactly the kind of thing that's hard to test from outside the app.

### Multi-context assertions with serverCheck

If you want to go further and compare browser state against server/database state, configure `server` in your config:

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'
import { db } from '../src/server/db'

export default defineConfig({
  baseUrl: 'http://localhost:5173',

  server: {
    getPost: (id) => db.posts.findById(id),
    getUser: (id) => db.users.findById(id),
  },
})
```

Then use `serverCheck()` inside your component to compare client and server state:

```tsx
import { should, serverCheck, match } from '@scenetest/checks-react'

// inside your onSettled callback:
serverCheck(
  'Post should match across client and server',
  async (server, { postId, localPost }) => {
    const dbPost = await server.getPost(postId)
    should('fields should match', match(
      [localPost.title, dbPost.title],
      [localPost.updated_at, dbPost.updated_at],
    ))
  },
  () => ({ postId: post.id, localPost: cached })
)
```

> **Note:** `serverCheck()` infrastructure is scaffolded but not fully wired end-to-end yet. `should()` and `failed()` work today. We recommend starting with those and adding `serverCheck()` calls that will light up when it ships.

All of this gets stripped from your production bundle by the Vite plugin. Zero production footprint.

For the full inline assertions guide, see [Writing Inline Assertions](/guides/writing-inline-assertions/).

## 3. Write Your First Spec

Scene specs describe user journeys -- what does the user see, what do they click, what do they expect. The simplest way to write a spec is with the Markdown DSL. Create a `.spec.md` file:

```text
<!-- scenetest/scenes/hello.spec.md -->

# user can view the home page

visitor:
- openTo /
- see main-content
- seeText Welcome
```

That's a complete, runnable scene spec. `visitor` is an **actor** -- a named role representing a user. `openTo`, `see`, and `seeText` are actions from the [Actor API](/reference/actor-api/).

### Define your first actor

Actors need credentials. Create an actors file in `scenetest/actors/`:

```typescript
// scenetest/actors/default.ts
import type { TeamConfig } from '@scenetest/scenes'

export default [
  {
    'visitor': {},                                    // no credentials = fresh browser
    'logged-in-user': {
      email: 'testuser@example.com',
      password: 'test123',
    },
  },
] satisfies TeamConfig[]
```

Each entry in the array is a **team** -- a self-contained set of actors with credentials matching your seed data. Start with one team. For the full guide on designing teams, see [Building Good Teams of Actors](/guides/building-teams/).

### A more realistic spec

Here's a spec with a logged-in user and some interaction:

```text
<!-- scenetest/scenes/profile.spec.md -->

# user can update their profile

logged-in-user:
- openTo /login
- see login-form
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- see dashboard
- click profile-link
- see profile-form
- typeInto display-name-input 'New Display Name'
- click save-button
- seeToast save-confirmation
```

A few things to notice:

- `[self.email]` interpolates the actor's own email from the team config
- `seeToast` waits for an element to appear _and then disappear_ (perfect for toast notifications)
- Actions are space-separated tokens that resolve against `data-testid`, `aria-label`, `id`, `data-name`, `data-key`, and `name` attributes. See the [Selectors reference](/reference/selectors/)

Run it:

```bash
pnpm scenetest
```

The runner discovers `.spec.md` files, launches a browser for each actor, and runs through the action queues. If a selector can't be found, the test fails with a clear message about what it was looking for.

For the full Markdown DSL syntax (nesting, quoting, conditionals, macros, variable interpolation), see the [Text DSL reference](/reference/text-dsl/).

## 4. Add Semantic DOM Markers

Your specs target elements by semantic names like `login-form` or `submit-button`. These need to exist in your markup as `data-testid`, `aria-label`, or one of the other [supported attributes](/reference/selectors/). For guidance on which attribute to use when, see [Choosing the Right Attribute](/guides/writing-scene-specs/#choosing-the-right-attribute). For the container + `data-key` pattern for list items, see the [Selectors Reference](/reference/selectors/#container--data-key-pattern).

Adding these markers is mechanical work, and LLMs are very good at it. Copy the prompt below into a conversation with your codebase:

````
You are adding semantic DOM markers to a web application so that end-to-end tests can target elements by intent rather than by CSS class or DOM structure.

## Rules

1. Read the scene spec files (*.spec.md and *.spec.ts) in the project to find every selector token used in actions like `see`, `click`, `typeInto`, `seeToast`, `check`, `select`, etc.

2. For each selector token, find the corresponding element in the application source code.

3. Add the appropriate attribute:
   - `data-testid="token"` — the default for one-of-a-kind elements AND list containers
   - `aria-label="token"` — prefer this for interactive elements that would benefit from accessibility labeling anyway (buttons with just an icon, close buttons, navigation landmarks)
   - `data-key="value"` — use on items inside a `data-testid` container to identify each row by ID. Prefer this over dynamic `data-testid` like `data-testid={`item-${id}`}` — put `data-testid` on the container and `data-key` on each item
   - `data-name="token"` with `data-key="value"` — fallback for list items that have no natural container element. `data-name` identifies the element type, `data-key` identifies the instance

4. Name markers by **what the element represents**, not how it looks:
   - Good: `data-testid="submit-order"`, `data-testid="cart-summary"`
   - Bad: `data-testid="blue-button"`, `data-testid="div-3"`
   - Bad: `data-testid={`order-${order.id}`}` — use `data-testid="order-list"` on the container + `data-key={order.id}` on each item

5. Do NOT remove or change any existing attributes, event handlers, or component logic. Only add the data-testid / aria-label / data-name / data-key attributes.

6. If a selector token from a spec doesn't have a clear match in the source code, list it separately so the team can decide where it should go.

## Output

For each file you modify, show the before and after for the changed lines. At the end, list:
- All markers added (token → file:line)
- Any spec selectors with no clear match
- Any elements you think should have a marker but don't appear in specs yet (optional suggestions)
````

### How to use this prompt

1. Paste it into an LLM conversation along with your spec files and component source
2. Review the suggested changes -- the markers are purely additive, so they won't affect your app's behavior
3. Apply the changes
4. Run `pnpm scenetest` and watch specs start passing

This step gets easier over time. Once you're in the habit of adding `data-testid` to new components as you build them, the specs just work.

## 5. Convert Existing Tests to Markdown Specs

If you have existing Playwright or Cypress tests, you can get an LLM to convert them to Scenetest's Markdown DSL. Copy this prompt:

````
You are converting existing end-to-end test files into Scenetest Markdown DSL scene specs (.spec.md files).

## Background

Scenetest scene specs use a simple line-based format where each actor gets a queue of actions. The format:

```
# Scene title

actor-role-name:
- action selector [value]
- action selector [value]
```

Available actions:
  openTo <url>              — navigate to URL
  see <selector>            — wait for element visible (sets scope)
  seeInView <selector>      — visible AND in viewport
  notSee <selector>         — wait for element hidden
  seeText <text>            — wait for text visible
  seeToast <selector>       — wait for appear then disappear
  click [<selector>]        — click (bare click = click current scope)
  typeInto <selector> <value> — fill input
  check <selector>          — check checkbox
  select <selector> <value> — select dropdown option
  wait <ms>                 — wait milliseconds
  emit <message>            — post to message bus
  waitFor <message>         — block until message arrives
  up [<selector>]           — navigate scope to ancestor (bare = reset)
  prev                      — return to previous scope
  scrollToBottom             — scroll current scope to bottom

Selectors match against: data-testid, aria-label, id, data-name, data-key, name.
Space-separated tokens drill into nested elements: `see sidebar nav-menu settings-link`

Variable interpolation: [self.email], [self.password], [other-actor.field]

Multi-actor coordination: use `emit` and `waitFor` to synchronize actors.

## Rules

1. Read the existing test files.
2. For each test, create a `## scene name` section.
3. Map `page.goto(url)` → `openTo <url>`
4. Map `page.locator('[data-testid="x"]')` → just use `x` as the selector
5. Map `locator.click()` → `click <selector>`
6. Map `locator.fill('value')` → `typeInto <selector> value`
7. Map `expect(locator).toBeVisible()` → `see <selector>`
8. Map `expect(page.getByText('x'))` → `seeText x`
9. Drop all `await`, `expect`, `page.evaluate`, and assertion wrappers — the Scenetest runner handles waiting and assertions.
10. If a test uses multiple browser contexts, map each to a separate actor role.
11. Ignore helper/utility code that sets up test fixtures — that's handled by actor teams and seed data.
12. If something can't be mapped to the DSL (custom JavaScript evaluation, complex assertions on extracted values), add a comment `// TODO: move this logic to an inline check in the component`.

## Output

Produce one `.spec.md` file per test file, with `## scene name` sections for each test case. At the end, list any actions that couldn't be cleanly converted.
````

### How to use this prompt

1. Paste it into an LLM conversation along with your existing test files
2. Review the output -- it should produce clean `.spec.md` files
3. Save them into `scenetest/scenes/`
4. Anything that couldn't be converted (complex `page.evaluate` logic, data extraction, value comparisons) belongs as an inline `should()` or `serverCheck()` in your component code, not in the spec

## 6. Build Out Your Scenes

At this point you have the foundations: inline checks validating your mental model from inside the app, and scene specs driving the browser from outside. Now build out coverage.

### Add more actors

Most real user journeys involve more than one person. Add roles to your team and use them in specs:

```text
# sender sends a message and receiver sees it

sender:
- openTo /login
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- see inbox
- click compose-button
- typeInto message-body 'Hello from the test!'
- click send-button
- emit message-sent

receiver:
- openTo /login
- typeInto email-input [self.email]
- typeInto password-input [self.password]
- click submit-button
- waitFor message-sent
- see inbox
- seeText 'Hello from the test!'
```

In the concurrent model, both actors run simultaneously. `emit` and `waitFor` synchronize them when one needs to wait for the other. See [Writing Scene Specs](/guides/writing-scene-specs/) for the full guide.

### Add more inline checks

Go deeper on the checks that matter to you. The best candidates are:

- **Mutation callbacks** -- `onSettled`, `onSuccess`, `onError`. By the time these fire, your local state and return data should agree.
- **Derived/computed state** -- if you compute a value from multiple sources, assert the invariant.
- **Error boundaries and fallbacks** -- use `failed()` in code paths that should never run.
- **Sync points** -- any moment where you expect multiple data sources to agree (cache vs. server, optimistic update vs. confirmed state).

```tsx
// In a React Query mutation callback
onSettled: (data, error) => {
  if (error) return
  const cached = queryClient.getQueryData(['todos'])
  should('new todo should appear in cache',
    cached?.some(t => t.id === data.id),
    { data, cached }
  )
}
```

### Scale with teams

When your test suite grows, add more actor teams to run scenes in parallel. Each team is a self-contained set of credentials matching your seed data. Two teams = two scenes running concurrently. See [Building Good Teams of Actors](/guides/building-teams/).

## What's Next

- [Choosing the Right Attribute](/guides/writing-scene-specs/#choosing-the-right-attribute) -- which attributes to use, common mistakes, and the ESLint plugin
- [Writing Scene Specs](/guides/writing-scene-specs/) -- the full guide to all three authoring styles
- [Writing Inline Assertions](/guides/writing-inline-assertions/) -- deep dive into `should()`, `failed()`, `serverCheck()`, and framework hooks
- [Building Good Teams of Actors](/guides/building-teams/) -- designing teams, seed data, and scaling concurrency
- [Selectors Reference](/reference/selectors/) -- attribute matching, nesting, key selectors, aliases
- [Text DSL Reference](/reference/text-dsl/) -- full Markdown DSL grammar, interpolation, macros
- [Actor API Reference](/reference/actor-api/) -- complete method list for actor handles
