# Actors API Design

**STATUS: Implemented** in `packages/scenetest-cli/src/` — actor.ts, team-manager.ts, config.ts.

---

## Philosophy

Actor config should contain **only what a user remembers when they sit down at the computer**:

1. **Login credentials** - How they get in
2. **Pre-existing knowledge** - Things they know but haven't entered yet (language preference, country, etc.)

Everything else the actor discovers **through the app being tested**. No database IDs, no seed data references - just what a real user would know before opening the browser.

For the full practical guide on designing teams, structuring seed data, and scaling concurrency, see [Building Good Teams of Actors](/guides/building-teams).

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

```ts [Concurrent (ts)]
import { scene } from '@scenetest/cli'

scene('learner completes first lesson', ({ actor }) => {
  const learner = actor('primary-learner')

  learner.openTo('/login')
  learner.typeInto('email-input', learner.email!)
  learner.typeInto('password-input', learner.password!)
  learner.click('submit')

  // "Remembered" metadata available on the actor
  console.log(learner.targetLanguage) // 'spanish'
})
```

```ts [Classic Driver (ts)]
import { test } from '@scenetest/cli'

test('learner completes first lesson', async ({ actor }) => {
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

```ts [Concurrent (ts)]
scene('friend request flow', ({ actor }) => {
  const learner = actor('primary-learner')
  const friend = actor('existing-friend')

  // Both actors' queues drain concurrently
  learner.openTo('/login')
  learner.typeInto('email', learner.email!).typeInto('password', learner.password!).click('submit')

  friend.openTo('/login')
  friend.typeInto('email', friend.email!).typeInto('password', friend.password!).click('submit')

  learner.openTo('/users')
  learner.click(`add-friend ${friend.username}`)

  friend.see('friend-request')
  friend.click('accept')

  learner.see('friend-added')
})
```

```ts [Classic Driver (ts)]
test('friend request flow', async ({ actor }) => {
  const learner = await actor('primary-learner')
  const friend = await actor('existing-friend')

  await learner.openTo('/login')
  await learner.typeInto('email', learner.email).typeInto('password', learner.password).click('submit')

  await friend.openTo('/login')
  await friend.typeInto('email', friend.email).typeInto('password', friend.password).click('submit')

  await learner.openTo('/users')
  await learner.click(`add-friend ${friend.username}`)

  await friend.see('friend-request')
  await friend.click('accept')

  await learner.see('friend-added')
})
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
