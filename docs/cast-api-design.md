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
    login: { email: 'alice@test.com', password: 'password123' }
  }
}
```

## Proposed Structure

```typescript
type LoginCredentials = {
  email?: string
  username?: string
  password?: string
  // OAuth tokens, API keys, etc. could go here too
  [key: string]: unknown
}

type ActorConfig = {
  id: string                    // Required: system identifier
  login?: LoginCredentials      // How they authenticate
  [key: string]: unknown        // "Things they remember" - sparse metadata
}

type Crew = {
  [role: string]: ActorConfig
}

type Config = {
  baseUrl: string
  crews: Crew[]                 // Renamed from "casts" for clarity
  // ...
}
```

## Example: Language Learning App

```typescript
export default defineConfig({
  baseUrl: 'http://localhost:5173',

  crews: [
    {
      // The main character - a new user learning Spanish
      learner: {
        id: 'user-1',
        login: { email: 'maria@test.com', password: 'test123' },
        // Things she "remembers" but hasn't entered yet:
        nativeLanguage: 'english',
        targetLanguage: 'spanish',
      },

      // A friend who's already on the platform
      friend: {
        id: 'user-2',
        login: { email: 'carlos@test.com', password: 'test123' },
      },

      // A stranger - someone they'll meet organically
      stranger: {
        id: 'user-3',
        login: { email: 'stranger@test.com', password: 'test123' },
      },
    },
    // Second crew for parallel test execution
    {
      learner: {
        id: 'user-4',
        login: { email: 'john@test.com', password: 'test123' },
        nativeLanguage: 'english',
        targetLanguage: 'french',
      },
      friend: {
        id: 'user-5',
        login: { email: 'pierre@test.com', password: 'test123' },
      },
      stranger: {
        id: 'user-6',
        login: { email: 'stranger2@test.com', password: 'test123' },
      },
    },
  ],
})
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

  // Login credentials available directly
  await learner.openTo('/login')
  await learner.typeInto('email', learner.login.email)
  await learner.typeInto('password', learner.login.password)
  await learner.click('submit')

  // "Remembered" metadata available
  console.log(learner.targetLanguage) // 'spanish'

  // Everything else - fetch from DB or seed data
  // const profile = await fetchUserProfile(learner.id)
})
```

## Open Questions

### 1. Should `login` be a reserved nested object or flat?

**Option A: Nested (proposed)**
```typescript
{
  id: 'user-1',
  login: { email: 'test@test.com', password: 'pass' },
  targetLanguage: 'spanish',
}
```

**Option B: Flat with convention**
```typescript
{
  id: 'user-1',
  email: 'test@test.com',      // Used for login
  password: 'pass',            // Used for login
  targetLanguage: 'spanish',   // Metadata
}
```

Option A makes the distinction clearer. Option B is simpler.

### 2. Should we support "anonymous" actors?

```typescript
{
  visitor: {
    // No id, no login - just a fresh browser
  }
}
```

Useful for testing logged-out experiences.

### 3. Should metadata support functions for dynamic values?

```typescript
{
  learner: {
    id: 'user-1',
    login: { email: 'test@test.com', password: 'pass' },
    // Generate fresh each run?
    sessionId: () => crypto.randomUUID(),
  }
}
```

### 4. How do crews relate to seed data?

The assumption is that seed data is **pre-populated** and **matches** the crew config:

```
seed-data.sql:
  INSERT INTO users (id, email, ...) VALUES ('user-1', 'maria@test.com', ...);
  INSERT INTO users (id, email, ...) VALUES ('user-2', 'carlos@test.com', ...);

crews config:
  learner: { id: 'user-1', login: { email: 'maria@test.com', ... } }
  friend: { id: 'user-2', login: { email: 'carlos@test.com', ... } }
```

The crew config is the **minimal slice** of seed data needed to begin.

## Migration from Current API

Current:
```typescript
casts: [
  {
    user: { id: 'user-1', username: 'alice', email: 'alice@test.com' },
  }
]
```

Proposed:
```typescript
crews: [
  {
    user: {
      id: 'user-1',
      login: { username: 'alice', email: 'alice@test.com', password: 'test' },
    }
  }
]
```

The change:
1. Rename `casts` → `crews` (optional, for clarity)
2. Move auth fields into `login` object
3. Any additional fields are "remembered metadata"

Both could be supported during migration with a deprecation warning.
