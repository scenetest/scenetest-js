# Cast API Design

## Philosophy

The cast config should contain **only what a user remembers when they sit down at the computer**:

1. **Login credentials** - How they get in
2. **Their identity** - User ID (what the system knows them as)
3. **Pre-existing knowledge** - Things they know but haven't entered yet (language preference, country, etc.)

Everything else comes from:
- **Seed data** - Pre-populated in setup scripts
- **Database queries** - Fetched during test execution
- **The test itself** - Created/modified during the scene

## Design Principle: Sparse by Default

A cast member is defined by their **role in the story**, not their full profile.

```typescript
// ❌ Too much - this is database data, not login data
{
  user: {
    id: 'user-1',
    username: 'alice',
    email: 'alice@test.com',
    password: 'password123',
    firstName: 'Alice',
    lastName: 'Smith',
    avatar: '/avatars/alice.png',
    createdAt: '2024-01-01',
    settings: { theme: 'dark', notifications: true }
  }
}

// ✅ Just what they need to log in + what they "remember"
{
  user: {
    id: 'user-1',
    email: 'alice@test.com',
    password: 'password123',
  }
}
```

## Structure

```typescript
type ActorConfig = {
  id: string                    // Required: system identifier (matches seed data)
  [key: string]: unknown        // Flat: credentials + "things they remember"
}

type Team = {
  [role: string]: ActorConfig   // role = story relationship (protagonist, friend, stranger)
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

## Example: Language Learning App

```typescript
export default defineConfig({
  baseUrl: 'http://localhost:5173',

  teams: [
    {
      // The main character - a new user learning Spanish
      learner: {
        id: 'user-1',
        email: 'maria@test.com',
        password: 'test123',
        // Things she "remembers" but hasn't entered yet:
        nativeLanguage: 'english',
        targetLanguage: 'spanish',
      },

      // A friend who's already on the platform
      friend: {
        id: 'user-2',
        email: 'carlos@test.com',
        password: 'test123',
      },

      // A stranger - someone they'll meet organically
      stranger: {
        id: 'user-3',
        email: 'stranger@test.com',
        password: 'test123',
      },
    },

    // Second team for parallel test execution
    {
      learner: {
        id: 'user-4',
        email: 'john@test.com',
        password: 'test123',
        nativeLanguage: 'english',
        targetLanguage: 'french',
      },
      friend: {
        id: 'user-5',
        email: 'pierre@test.com',
        password: 'test123',
      },
      stranger: {
        id: 'user-6',
        email: 'stranger2@test.com',
        password: 'test123',
      },
    },
  ],
})
```

## Anonymous Actors

For testing logged-out experiences, actors can omit `id`:

```typescript
{
  visitor: {
    // No id, no credentials - just a fresh browser context
  },
  signupUser: {
    // Will create account during test, no pre-existing id
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

## Accessing Actor Data in Scenes

```typescript
scene('learner completes first lesson', async ({ cast }) => {
  const learner = await cast('learner')

  // All config fields available directly on the actor
  await learner.openTo('/login')
  await learner.typeInto('email-input', learner.email)
  await learner.typeInto('password-input', learner.password)
  await learner.click('submit')

  // "Remembered" metadata available too
  console.log(learner.targetLanguage) // 'spanish'
  console.log(learner.id)             // 'user-1'

  // Everything else - fetch from DB or seed data
  // const profile = await fetchUserProfile(learner.id)
})
```

## How Teams Relate to Seed Data

The assumption is that seed data is **pre-populated** and **matches** the team config:

```
seed-data.sql:
  INSERT INTO users (id, email, ...) VALUES ('user-1', 'maria@test.com', ...);
  INSERT INTO users (id, email, ...) VALUES ('user-2', 'carlos@test.com', ...);

teams config:
  learner: { id: 'user-1', email: 'maria@test.com', password: '...' }
  friend: { id: 'user-2', email: 'carlos@test.com', password: '...' }
```

The team config is the **minimal slice** of seed data needed to begin.

## Migration from Current API

Current:
```typescript
casts: [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
  }
]
```

New:
```typescript
teams: [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com', password: 'test' },
  }
]
```

The change:
1. Rename `casts` → `teams`
2. Credentials stay flat (no change needed if already flat)
3. Any additional fields are "remembered metadata"

Both could be supported during migration with a deprecation warning.

## Open Questions

### 1. Should `id` be required or optional?

Currently proposed as required. But for anonymous/signup flows, there's no pre-existing id.

Options:
- **A)** `id` required, use placeholder like `id: 'new-user'` for signup flows
- **B)** `id` optional, omit for anonymous actors
- **C)** Different field name? (`userId`? `dbId`?)

### 2. Should metadata support functions for dynamic values?

```typescript
{
  learner: {
    id: 'user-1',
    email: 'test@test.com',
    // Generate fresh each run?
    verificationCode: () => generateCode(),
  }
}
```

### 3. Config function name: `cast()` vs `actor()` vs `team()`?

In scenes, we currently use `cast('role')` to get an actor:

```typescript
scene('...', async ({ cast }) => {
  const user = await cast('user')
})
```

Should this change to match the `teams` terminology?
- `cast('user')` - current
- `actor('user')` - emphasizes the individual
- `member('user')` - matches "team member"
