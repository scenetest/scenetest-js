# Building Good Teams of Actors

Teams are the foundation of Scenetest's concurrency model. A **team** is a complete, internally-consistent set of actors where every relationship holds. Get your teams right, and your scenes run reliably, concurrently, and without shared-state bugs.

This guide covers how to design teams, how they relate to seed data, and how to scale concurrency by adding more teams.

## Core Principle: Teams Mirror Your Seed Data

Every team is a self-contained world. The actors in a team map 1:1 to users in your seed data, and the relationships between them (friendships, org memberships, permissions) must already exist in that seed data.

```
seed-data.sql:
  INSERT INTO users (email, password_hash) VALUES ('maria@test.com', ...);
  INSERT INTO users (email, password_hash) VALUES ('carlos@test.com', ...);
  INSERT INTO friendships (user_a, user_b) VALUES ('maria', 'carlos');

actors/team-maria.ts:
  'primary-learner':  { email: 'maria@test.com',  password: 'test123' }
  'existing-friend':  { email: 'carlos@test.com', password: 'test123' }
```

If a scene calls `actor('existing-friend')`, that actor must already be friends with `actor('primary-learner')` in the database. The actor files don't create these relationships -- your seed data does.

## Step 1: Identify Roles From Your Scenes

Start with the scenes you want to test. Each distinct persona in a scene becomes a **role**. Name roles by their relationship to the story, not by system role:

```typescript
// Good: story-driven role names
'primary-learner'       // the main character
'existing-friend'       // already connected to the main character
'random-stranger'       // no prior relationship
'responding-moderator'  // will take action on a report
'new-signup'            // fresh account, no history

// Avoid: generic system roles
'user'     // which user? doing what?
'admin'    // what's their purpose in this scene?
```

Collect all roles across all your scenes. The union of those roles is what every team needs to provide.

## Step 2: Design Your Seed Data Around Roles

For each role, decide what pre-existing state that actor needs:

| Role | Seed Data Requirements |
|------|----------------------|
| `primary-learner` | Has account, has completed onboarding, has profile |
| `existing-friend` | Has account, is friends with `primary-learner` |
| `random-stranger` | Has account, no connections to anyone |
| `new-signup` | No account yet (empty credentials, will register) |
| `responding-moderator` | Has account, has moderator permissions |

Then write seed data that creates all of this for each team.

## Step 3: Define Actor Teams in Files

Actor teams live in files next to your config, not inside the config itself. Scenetest auto-discovers them.

### Option A: Single `actors.ts` file

Export an array of teams. Each team maps role names to actor credentials:

```typescript
// actors.ts
import type { TeamConfig } from '@scenetest/cli'

export default [
  // Team 0
  {
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
      email: 'stranger-a@test.com',
      password: 'test123',
    },
    'responding-moderator': {
      email: 'mod-alpha@test.com',
      password: 'test123',
    },
    'new-signup': {
      email: 'fresh-a@test.com',
      password: 'willregister123',
    },
  },
] satisfies TeamConfig[]
```

### Option B: `actors/` directory (one file per team)

Each file exports a single team. Use this when you have many teams or want to keep each team's data self-contained:

```typescript
// actors/team-maria.ts
import type { TeamConfig } from '@scenetest/cli'

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
    email: 'stranger-a@test.com',
    password: 'test123',
  },
} satisfies TeamConfig
```

```typescript
// actors/team-john.ts
import type { TeamConfig } from '@scenetest/cli'

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
    email: 'stranger-b@test.com',
    password: 'test123',
  },
} satisfies TeamConfig
```

### Discovery rules

Scenetest looks for actor files relative to your config file:

1. `actors.ts` (or `.js`/`.mjs`) -- single file exporting an array of teams
2. `actors/*.ts` -- directory with one file per team

The config file itself has no actor definitions:

```typescript
// scenetest.config.ts
import { defineConfig } from '@scenetest/cli'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
})
```

### Project layout

```
your-project/
├── scenetest.config.ts          # or scenetest/config.ts
├── actors.ts                    # or actors/*.ts
├── scenes/
│   ├── onboarding.spec.ts
│   └── social/
│       └── friend-request.spec.ts
└── src/
    └── ...
```

Or using the `scenetest/` directory convention:

```
your-project/
├── scenetest/
│   ├── config.ts
│   ├── actors/
│   │   ├── team-maria.ts
│   │   └── team-john.ts
│   └── scenes/
│       ├── onboarding.spec.ts
│       └── social/
│           └── friend-request.spec.ts
└── src/
    └── ...
```

### What goes in actor config

- **Login credentials**: email, password, username -- however your app authenticates
- **Pre-existing knowledge**: things the actor "knows" before opening the browser (language preference, country, etc.)
- **Nothing else**: no database IDs, no internal state. The actor discovers everything else through the app.

### Anonymous actors

For logged-out or signup flows, actors can have empty or partial credentials:

```typescript
'logged-out-visitor': {
  // No credentials -- just a fresh browser context
},
'new-signup': {
  email: 'newuser@test.com',
  password: 'willsignup123',
  // Account doesn't exist yet in seed data
},
```

## Step 4: Scale Concurrency With More Teams

Scenetest's concurrency model: **N teams = N scenes running in parallel**. Each scene gets exclusive use of one team. No shared state, no race conditions.

To add concurrency, add more actor files (or array entries) with different actors who have the same relationships:

```typescript
// actors/team-maria.ts -- maria's world
export default {
  'primary-learner': { email: 'maria@test.com', password: 'test123' },
  'existing-friend': { email: 'carlos@test.com', password: 'test123' },
  'random-stranger': { email: 'stranger-a@test.com', password: 'test123' },
}

// actors/team-john.ts -- john's world (same roles, different people)
export default {
  'primary-learner': { email: 'john@test.com', password: 'test123' },
  'existing-friend': { email: 'pierre@test.com', password: 'test123' },
  'random-stranger': { email: 'stranger-b@test.com', password: 'test123' },
}

// actors/team-kate.ts -- kate's world
export default {
  'primary-learner': { email: 'kate@test.com', password: 'test123' },
  'existing-friend': { email: 'leo@test.com', password: 'test123' },
  'random-stranger': { email: 'stranger-c@test.com', password: 'test123' },
}
```

Each team's seed data must independently set up all the same relationships. `pierre` must be friends with `john` just like `carlos` is friends with `maria`.

### How many teams?

- **1 team**: Scenes run sequentially. Fine for getting started.
- **2-3 teams**: Good for most projects. Parallel execution without huge seed data.
- **N teams**: Match to your CI parallelism needs. More teams = more seed data to maintain.

Start with 1 team. Add more when test suite runtime becomes a bottleneck.

## Step 5: Keep Seeds and Teams in Sync

When scenes change, teams and seed data may need to change too. Common triggers:

| Scene Change | Team/Seed Impact |
|---|---|
| New scene needs a "banned user" actor | Add `banned-user` role to every team, add banned users to seed data |
| Scene tests org permissions | Add `org-admin` and `org-member` roles, seed org membership |
| Scene removed the "stranger" interactions | Consider removing `random-stranger` role if no other scene uses it |
| New scene needs users with specific content | Seed that content (posts, messages, etc.) for the relevant actors |

The rule: **your seed data is the source of truth for what relationships exist.** The actor files just provide the credentials to log in as those users.

## Common Patterns

### The Social Graph Team

For apps with social features (friends, followers, messaging):

```typescript
{
  'active-poster':     { email: '...', password: '...' },  // has posts, has followers
  'mutual-friend':     { email: '...', password: '...' },  // friends with active-poster
  'follower-only':     { email: '...', password: '...' },  // follows but not followed back
  'blocked-user':      { email: '...', password: '...' },  // blocked by active-poster
  'new-arrival':       { email: '...', password: '...' },  // no connections
}
```

### The Marketplace Team

For e-commerce or marketplace apps:

```typescript
{
  'buyer':              { email: '...', password: '...' },  // has payment method, has order history
  'seller':             { email: '...', password: '...' },  // has listed items
  'buyer-with-dispute': { email: '...', password: '...' },  // has open dispute with seller
  'support-agent':      { email: '...', password: '...' },  // has support permissions
  'new-customer':       { email: '...', password: '...' },  // fresh account
}
```

### The Multi-Tenant Team

For B2B SaaS with organizations:

```typescript
{
  'org-owner':       { email: '...', password: '...' },  // owns the org
  'org-admin':       { email: '...', password: '...' },  // admin in same org
  'org-member':      { email: '...', password: '...' },  // regular member in same org
  'other-org-user':  { email: '...', password: '...' },  // different org entirely
  'invited-user':    { email: '...', password: '...' },  // has pending invitation
}
```

## Checklist

Before running scenes, verify:

- [ ] Every role referenced by `actor('role-name')` in any scene exists in every team
- [ ] Every actor's email/password in team files matches a user in seed data
- [ ] All relationships between actors (friendships, permissions, org membership) exist in seed data
- [ ] Each team is self-contained -- no actor appears in multiple teams
- [ ] Anonymous actors (no credentials) are only used in scenes that don't require login

---

## LLM Instruction: Audit Teams Against Seeds and Scenes

Copy the following instruction block and paste it into an LLM conversation along with your project's seed data, scene specs, and actor files. The LLM will analyze alignment between the three and recommend changes.

````
You are a Scenetest team auditor. Your job is to analyze a project's seed data, scene specs, and actor team definitions to find mismatches and recommend improvements.

## Background

Scenetest uses three connected concepts:
- **Seeds**: Database seed files that create test users with specific relationships (friendships, permissions, org membership, content, etc.)
- **Actor teams**: Files (`actors.ts` or `actors/*.ts`) that define sets of actor credentials mapped to role names. Each team is a self-contained world -- all relationships between actors must hold within that team's seed data.
- **Scenes**: Test specs that call `actor('role-name')` to get actors and orchestrate user journeys.

These three must stay aligned:
- Every role used in a scene must exist in every team
- Every actor credential in a team must match a user in seed data
- Every relationship a scene depends on must be established in seed data

## Your Task

When given a project's files, do the following:

### 1. Inventory the seed data

Read all seed files (SQL, JSON, JS/TS seed scripts, migration files, fixture files). Extract:
- Every test user: username, email, password or auth method
- Relationships between users: friendships, follows, blocks, org memberships, role assignments
- Content owned by users: posts, orders, messages, listings
- Permissions and capabilities: admin flags, moderator status, feature flags

Present this as a table:

| User | Email | Key Relationships | Content/State |
|------|-------|-------------------|---------------|

### 2. Inventory the scenes

Read all `.spec.ts` scene files. For each scene, extract:
- Scene name
- Every `actor('role-name')` call -- which roles does this scene need?
- What relationships the scene assumes between actors (e.g., "sender finds receiver in friends list" implies they are friends)
- What pre-existing state the scene assumes (e.g., "user sees their posts" implies the user has posts)

Present this as a table:

| Scene | Roles Used | Assumed Relationships | Assumed State |
|-------|-----------|----------------------|---------------|

### 3. Inventory the teams

Read the actor files (`actors.ts` or `actors/*.ts`). For each team, extract:
- Role name → actor email mapping
- Any extra properties on actors (language, preferences, etc.)

### 4. Find mismatches

Check for these problems:

**Missing roles**: A scene calls `actor('role-name')` but that role doesn't exist in the actor files.

**Missing seed users**: A team references an email that doesn't exist in seed data.

**Missing relationships**: A scene assumes a relationship (e.g., two actors are friends) but the seed data doesn't establish it for that team's actors.

**Missing state**: A scene assumes pre-existing content (posts, orders, etc.) but seed data doesn't create it.

**Orphaned roles**: A role exists in the actor files but no scene uses it. (Not necessarily wrong, but worth flagging.)

**Orphaned seed users**: A user exists in seed data but isn't referenced by any team. (May be intentional for manual testing.)

**Team inconsistency**: Teams don't all have the same roles, or relationships differ between teams.

### 5. Recommend changes

For each mismatch, recommend a specific fix:

- **Add to seeds**: "Add user `banned-user-a@test.com` to seed data with `is_banned: true`"
- **Add to actors**: "Add role `banned-user` to each team file mapping to the new seed user"
- **Add to seeds (relationship)**: "Add friendship between `maria@test.com` and `carlos@test.com` in seed data"
- **Remove from actors**: "Role `unused-role` is not referenced by any scene -- consider removing"
- **Add more teams**: "You have 12 scenes but only 1 team. Add N more teams with equivalent seed data to enable parallel execution. Each new team needs: [list of users and relationships]"

### 6. Recommend concurrency improvements

Based on the number of scenes and teams:
- If scenes > teams, recommend how many additional teams to add
- For each new team, specify exactly which seed users and relationships need to be created
- Provide a template for the new team's actor file and seed data

## Output Format

Structure your response as:

1. **Seed Data Inventory** (table)
2. **Scene Requirements** (table)
3. **Team Configuration** (table)
4. **Mismatches Found** (numbered list with severity: critical/warning/info)
5. **Recommended Changes** (grouped by: seeds, actors, scenes)
6. **Concurrency Recommendations** (if applicable)

Be specific. Use exact emails, role names, and file paths. Don't say "add a user" -- say "add `INSERT INTO users (email, password_hash, is_banned) VALUES ('banned-a@test.com', '$hash', true)` to `seed-data.sql`".
````

### How to use this instruction

1. Copy the block above into a new LLM conversation
2. Paste your project's files:
   - Your seed data files (SQL, JSON, or seed scripts)
   - Your actor files (`actors.ts` or `actors/*.ts`)
   - Your scene spec files from `scenes/`
3. Ask: "Audit my teams against my seeds and scenes"
4. Review the output and apply recommended changes
5. Re-run after making changes to verify alignment

### When to re-audit

Run this audit when:
- You add new scenes that introduce new roles or relationships
- You modify seed data (add/remove users, change relationships)
- You add or remove teams for concurrency changes
- Test failures suggest a seed data mismatch (actor can't log in, expected relationship missing)
- Onboarding a new team member who needs to understand the test data model
