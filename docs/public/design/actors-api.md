# Actors API Design

**STATUS: Design Complete** - Ready for implementation.

---

## Philosophy

Actor config should contain **only what a user remembers when they sit down at the computer**:

1. **Login credentials** - How they get in
2. **Pre-existing knowledge** - Things they know but haven't entered yet (language preference, country, etc.)

Everything else the actor discovers **through the app being tested**. No database IDs, no seed data references - just what a real user would know before opening the browser.

## Design Principle: Sparse by Default

A team member is defined by their **role in the story**, not their full profile.

```typescript
{
  'primary-user': {
    email: 'alice@test.com',
    password: 'password123',
    languageDesired: 'Kannada',
  },
  'friend-user': {
    email: 'bob@test.com',
    password: 'password123',
    // no languageDesired - doesn't need this backstory
  },
}
```

### Why flat credentials?

People will write their own login helpers. Auth could be:
- Email/password
- Username/password
- OAuth tokens
- Magic links
- Device-based auth
- Multi-factor flows

There's no universal `login` shape, so keep it flat and let the test author decide.

### Why no `id` field?

The actor should discover everything they need **through the app**. If a test needs a user's database ID, the actor finds it by logging in and navigating to their profile, or by inspecting the DOM/network responses - just like a real user would infer their identity from the app's UI.

## Example: Language Learning App

Actor teams live in files next to your config, not inside it. Scenetest auto-discovers them from `actors.ts` or `actors/*.ts`.

```typescript
// actors/team-maria.ts
export default {
  'primary-learner': {
    email: 'maria@test.com',
    password: 'test123',
    nativeLanguage: 'english',
    targetLanguage: 'spanish',
  },
  'existing-friend': {
    email: 'carlos@test.com',
    password: 'test123',
  },
  'random-stranger': {
    email: 'stranger@test.com',
    password: 'test123',
  },
}
```

```typescript
// actors/team-john.ts — second team for parallel execution
export default {
  'primary-learner': {
    email: 'john@test.com',
    password: 'test123',
    nativeLanguage: 'english',
    targetLanguage: 'french',
  },
  'existing-friend': {
    email: 'pierre@test.com',
    password: 'test123',
  },
  'random-stranger': {
    email: 'stranger2@test.com',
    password: 'test123',
  },
}
```

## Anonymous Actors

For testing logged-out or signup experiences:

```typescript
{
  'logged-out-visitor': {
    // No credentials - just a fresh browser context
  },
  'new-signup': {
    email: 'newuser@test.com',
    password: 'willsignup123',
  },
}
```

## Role Naming Convention

Roles should describe **relationship to the story**, not system roles. Use `kebab-case` for readability - you'll alias them in your scene anyway:

```typescript
{
  'primary-user': { ... },
  'helpful-mentor': { ... },
  'annoying-rival': { ... },
  'random-stranger': { ... },
  'new-signup': { ... },
}
```

If you need an admin for a test, the role should reflect their purpose in the story:

```typescript
{
  'reported-user': { ... },
  'responding-moderator': { ... },
}
```

## Accessing Actors in Scenes

Use the `actor()` function to get an actor by role:

```typescript
scene('learner completes first lesson', async ({ actor }) => {
  const learner = await actor('primary-learner')

  await learner.openTo('/login')
  await learner.typeInto('email-input', learner.email)
  await learner.typeInto('password-input', learner.password)
  await learner.click('submit')

  // "Remembered" metadata available on the actor
  console.log(learner.targetLanguage) // 'spanish'
})
```

### Multi-actor scenes

```typescript
scene('friend request flow', async ({ actor }) => {
  const learner = await actor('primary-learner')
  const friend = await actor('existing-friend')

  // Both actors log in
  await learner.openTo('/login')
  await learner.typeInto('email', learner.email).typeInto('password', learner.password).click('submit')

  await friend.openTo('/login')
  await friend.typeInto('email', friend.email).typeInto('password', friend.password).click('submit')

  // Learner sends friend request
  await learner.openTo('/users')
  await learner.click('add-friend-carlos')

  // Friend sees and accepts it
  await friend.see('friend-request')
  await friend.click('accept')

  // Learner sees confirmation
  await learner.see('friend-added')
})
```

## Actor API Reference

Every actor returned by `actor()` exposes the methods below. All methods (except `if()` and `warnIf()`) return an `ActionChain` that is chainable and thenable -- you can chain multiple actions together and `await` the result.

### Navigation

| Method | Description |
|--------|-------------|
| `openTo(url)` | Navigate to URL (full page load). Resets scope to page. |

### Visibility

| Method | Description |
|--------|-------------|
| `see(selector)` | Wait for element visible. **Updates scope** to the matched element. |
| `notSee(selector)` | Wait for element to be hidden or detached. |
| `seeText(text)` | Wait for text to be visible anywhere on the page. Updates scope. |
| `seeToast(selector)` | Wait for element to appear AND disappear (for transient UI). Does not update scope. |

### Interaction

| Method | Description |
|--------|-------------|
| `click(selector)` | Click element within current scope. |
| `typeInto(selector, value)` | Fill input within current scope. |
| `check(selector)` | Check checkbox within current scope. |
| `select(selector, value)` | Select dropdown option within current scope. |

### Scope Navigation

`see()` sets the current **scope** -- subsequent actions search within that element. Use these methods to navigate scope without drilling deeper:

| Method | Description |
|--------|-------------|
| `up(selector)` | Navigate to an ancestor matching the selector. |
| `prev()` | Return to the previous scope (undo the last scope change). |

```typescript
await user
  .see('modal')               // scope → modal
  .see('form')                // scope → form inside modal
  .typeInto('name', 'Test')   // types within form
  .prev()                     // scope → back to modal
  .click('close')             // clicks modal's close button
```

### Conditional Handling

| Method | Description |
|--------|-------------|
| `if(selector, callback)` | Register a watcher. If selector appears during the next `await`, run callback. Cleared after each await. |
| `warnIf(selector, message)` | Register a warning trigger. If selector appears during any subsequent action, record a warning. Persists for entire scene. |

```typescript
// Handle an optional modal that may or may not appear
user.if('welcome-modal', () => user.click('dismiss'))
await user.see('dashboard')

// Flag unexpected paths without failing the test
user.warnIf('error-banner', 'should not see errors after valid submit')
await user.click('submit')
```

### Utilities

| Method | Description |
|--------|-------------|
| `wait(ms)` | Wait for specified milliseconds. |
| `emit(message)` | Emit a message to the message bus (for coordinating between actors). |
| `do(fn)` | Execute a custom async function receiving the Playwright `Page`. |
| `scrollToBottom()` | Scroll the current scope (or nearest scrollable ancestor) to the bottom. |

```typescript
// Custom action with full Playwright access
await user.do(async (page) => {
  await page.evaluate(() => localStorage.setItem('token', 'abc'))
})

// Scroll to load lazy content
await user.scrollToBottom()
await user.see('load-more')
```

### Config Properties

All properties from the actor's config are forwarded to the handle instance, so you can access them directly:

```typescript
const learner = await actor('primary-learner')
learner.email           // 'maria@test.com'
learner.password        // 'test123'
learner.targetLanguage  // 'spanish' (custom property)
```

### Chaining

All action methods return an `ActionChain` that supports further chaining. The chain executes when awaited:

```typescript
await user
  .see('login-form')
  .typeInto('email', user.email)
  .typeInto('password', user.password)
  .click('submit')
  .see('dashboard')
```

## How Teams Relate to Seed Data

Seed data creates users that match the credentials in actor files. It's your
responsibility as a dev team to create seed data that makes sense for the roles the different
actors/personas will play in your scenes.

```
seed-data.sql:
  INSERT INTO users (email, password_hash, ...) VALUES ('maria@test.com', ...);
  INSERT INTO users (email, password_hash, ...) VALUES ('carlos@test.com', ...);

actors/team-maria.ts:
  'primary-learner': { email: 'maria@test.com', password: 'test123' },
  'existing-friend': { email: 'carlos@test.com', password: 'test123' },
```
