# Cast API Design

## Philosophy

The cast config should contain **only what a user remembers when they sit down at the computer**:

1. **Login credentials** - How they get in
2. **Pre-existing knowledge** - Things they know but haven't entered yet (language preference, country, etc.)

Everything else the actor discovers **through the app being tested**. No database IDs, no seed data references - just what a real user would know before opening the browser.

## Design Principle: Sparse by Default

A team member is defined by their **role in the story**, not their full profile.

```typescript
// ❌ Too much - database data doesn't belong here
{
  user: {
    id: 'user-1',              // ← actor discovers this through the app
    username: 'alice',
    email: 'alice@test.com',
    password: 'password123',
    firstName: 'Alice',        // ← database data
    lastName: 'Smith',         // ← database data
    avatar: '/avatars/alice.png',
    createdAt: '2024-01-01',
    settings: { theme: 'dark', notifications: true }
  }
}

// ✅ Just what they need to log in + what they "remember"
{
  user: {
    email: 'alice@test.com',
    password: 'password123',
  }
}
```

## Structure

```typescript
type ActorConfig = {
  [key: string]: unknown        // Flat: credentials + "things they remember"
}

type Team = {
  [role: string]: ActorConfig   // role = story relationship (learner, friend, stranger)
}

type Config = {
  baseUrl: string
  teams: Team[]
  // ...
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

```typescript
export default defineConfig({
  baseUrl: 'http://localhost:5173',

  teams: [
    {
      // The main character - a new user learning Spanish
      learner: {
        email: 'maria@test.com',
        password: 'test123',
        // Things she "remembers" but hasn't entered yet:
        nativeLanguage: 'english',
        targetLanguage: 'spanish',
      },

      // A friend who's already on the platform
      friend: {
        email: 'carlos@test.com',
        password: 'test123',
      },

      // A stranger - someone they'll meet organically
      stranger: {
        email: 'stranger@test.com',
        password: 'test123',
      },
    },

    // Second team for parallel test execution
    {
      learner: {
        email: 'john@test.com',
        password: 'test123',
        nativeLanguage: 'english',
        targetLanguage: 'french',
      },
      friend: {
        email: 'pierre@test.com',
        password: 'test123',
      },
      stranger: {
        email: 'stranger2@test.com',
        password: 'test123',
      },
    },
  ],
})
```

## Anonymous Actors

For testing logged-out or signup experiences:

```typescript
{
  visitor: {
    // No credentials - just a fresh browser context
  },
  signupUser: {
    // Will create account during test
    email: 'newuser@test.com',
    password: 'willsignup123',
  },
}
```

## Role Naming Convention

Roles should describe **relationship to the story**, not system roles:

```typescript
// ✅ Good - describes relationship/role in the scene
{
  protagonist: { ... },      // Main character
  mentor: { ... },           // Helps the protagonist
  rival: { ... },            // Competes with protagonist
  bystander: { ... },        // Observes but doesn't participate
  newUser: { ... },          // Fresh account, no history
}

// ❌ Avoid - describes system permissions, not story role
{
  admin: { ... },
  moderator: { ... },
  premiumUser: { ... },
}
```

If you need an admin for a test, the role should reflect WHY:

```typescript
{
  reportedUser: { ... },
  moderator: { ... },        // OK if their role IS to moderate in this scene
}
```

## Accessing Team Members in Scenes

The scene receives a pre-constructed `team` with all members ready to go:

```typescript
scene('learner completes first lesson', async ({ team }) => {
  // Access members directly - no await, no ceremony
  await team.learner.openTo('/login')
  await team.learner.typeInto('email-input', team.learner.email)
  await team.learner.typeInto('password-input', team.learner.password)
  await team.learner.click('submit')

  // "Remembered" metadata available on the actor
  console.log(team.learner.targetLanguage) // 'spanish'
})
```

### Multi-actor scenes

```typescript
scene('friend request flow', async ({ team }) => {
  // Both actors log in
  await team.learner.openTo('/login')
  await team.learner.typeInto('email', team.learner.email).typeInto('password', team.learner.password).click('submit')

  await team.friend.openTo('/login')
  await team.friend.typeInto('email', team.friend.email).typeInto('password', team.friend.password).click('submit')

  // Learner sends friend request
  await team.learner.openTo('/users')
  await team.learner.click('add-friend-carlos')

  // Friend sees and accepts it
  await team.friend.see('friend-request')
  await team.friend.click('accept')

  // Learner sees confirmation
  await team.learner.see('friend-added')
})
```

## How Teams Relate to Seed Data

Seed data creates users that match the credentials in team config:

```
seed-data.sql:
  INSERT INTO users (email, password_hash, ...) VALUES ('maria@test.com', ...);
  INSERT INTO users (email, password_hash, ...) VALUES ('carlos@test.com', ...);

teams config:
  learner: { email: 'maria@test.com', password: 'test123' }
  friend: { email: 'carlos@test.com', password: 'test123' }
```

The team config contains **only what's needed to log in**. Everything else (user IDs, profiles, relationships) the actor discovers through the app.

## Migration from Current API

Current:
```typescript
casts: [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
  }
]

scene('...', async ({ cast }) => {
  const user = await cast('user')
  await user.openTo('/')
})
```

New:
```typescript
teams: [
  {
    user: { username: 'alice', email: 'alice@test.com', password: 'test' },
  }
]

scene('...', async ({ team }) => {
  await team.user.openTo('/')
})
```

Changes:
1. Rename `casts` → `teams`
2. Drop `id` field (actor discovers identity through the app)
3. Scene receives `team` object with members as properties
4. No more `await cast('role')` - just `team.role`
