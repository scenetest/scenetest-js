---
title: Generating Teams with LLMs
description: Prompt templates and tips for using LLMs to generate actor team files and seed data for Scenetest.
---

# Generating Teams and Seed Data with LLMs

LLMs are good at analyzing your codebase and generating the boilerplate that connects your app's user model to scenetest's team/actor structure. This guide covers how to prompt them effectively.

For the team format itself, see [Building Good Teams](/guides/building-teams/). For auditing existing teams against seeds and scenes, see the audit prompt at the bottom of that guide.

## Quick Start

Run the CLI helper to generate a prompt tailored to your project:

```bash
npx scenetest prompt teams     # Prompt for actor team files
npx scenetest prompt seeds     # Prompt for seed data
npx scenetest prompt both      # Combined prompt
```

This scans your project for user models, database schemas, existing seeds, and scene files, then outputs a ready-to-paste prompt.

```bash
# Pipe to clipboard
npx scenetest prompt both | pbcopy     # macOS
npx scenetest prompt both | xclip      # Linux

# Write to file
npx scenetest prompt both -o prompt.md
```

---

## Manual Approach: Prompt Templates

If you prefer to craft prompts by hand, use these templates.

### Template 1: Generating Actor Teams

Copy and fill in the `[PLACEHOLDERS]`:

````markdown
I need scenetest actor team files for my application.

## My Application

**What it does:** [Brief description]

**User types:**
[List user types, e.g.:]
- Regular users (can browse, purchase)
- Sellers (can list products, manage inventory)
- Admins (can moderate, manage users)
- Guest/anonymous (limited browsing)

**Relationships between users:**
[Describe relationships, e.g.:]
- Users can follow other users
- Sellers belong to a shop
- Admins can ban users

**Auth fields:**
[List fields, e.g.:]
- email (required, unique)
- password
- role enum: 'user' | 'seller' | 'admin'

## Scenetest Team Format

Teams live in `scenetest/actors/`, one file per team:

```typescript
// scenetest/actors/team-maria.ts
import type { TeamConfig } from '@scenetest/scenes'

export default {
  'primary-buyer': {
    key: 'buyer-a-1',
    email: 'buyer-a@test.com',
    password: 'test123',
  },
  'established-seller': {
    key: 'seller-est-1',
    email: 'seller-est@test.com',
    password: 'test123',
  },
} satisfies TeamConfig
```

**Rules:**
- `key` is the only required field
- Every team must have the same role names
- Credentials must match seed data users
- Use descriptive role names: 'primary-buyer', not 'user'

## Scenes I Plan to Write

[Describe 2-3 test scenarios, e.g.:]
- User browses products and makes a purchase
- Seller lists a product, buyer finds and buys it
- Admin moderates a reported listing

Generate 2-3 team files with roles covering these scenarios.
````

### Template 2: Generating Seed Data

````markdown
I need seed data matching my scenetest actor teams.

## My Team Files

```typescript
[PASTE YOUR scenetest/actors/*.ts FILES HERE]
```

## My Database Schema

[Describe tables or paste schema, e.g.:]

**Users table:**
- id: UUID
- email: string (unique)
- password_hash: string
- role: 'user' | 'seller' | 'admin'

**Follows table:**
- follower_id: UUID (FK users)
- following_id: UUID (FK users)

## My Existing Seed Format

[Show an example if you have one, e.g.:]

```typescript
await db.user.createMany({
  data: [
    { id: 'u1', email: 'test@example.com', ... },
  ]
})
```

## What I Need

Generate seed data that:
1. Creates users matching every actor in every team
2. Establishes the relationships my tests assume
3. Follows my existing seed patterns
4. Includes supporting data tests might need

## Relationships Needed

[List relationships between roles, e.g.:]
- 'primary-buyer' follows 'established-seller'
- 'established-seller' has 3 listed products
- 'dispute-moderator' has admin permissions
````

### Template 3: Combined (Teams + Seeds)

````markdown
I'm setting up scenetest and need both actor teams and seed data.

## Application Overview

[Describe your app, tech stack, auth system]

## User Model

```typescript
[PASTE YOUR USER TYPE/MODEL HERE]
```

## Scenetest Project Layout

```
my-project/
  scenetest/
    config.ts
    actors/
      team-maria.ts     ← one team per file
      team-john.ts
    scenes/
      ...
```

## Team File Format

```typescript
// scenetest/actors/team-maria.ts
import type { TeamConfig } from '@scenetest/scenes'

export default {
  'role-name': {
    key: 'unique-key',
    email: 'user@test.com',
    password: 'test123',
    // custom fields ok
  },
} satisfies TeamConfig
```

## Test Scenarios I Want to Cover

1. [Scenario 1]
2. [Scenario 2]
3. [Scenario 3]

Generate:
1. 2-3 team files for `scenetest/actors/`
2. Seed data in [my framework's format]
3. Explanation of each role
4. List of relationships seeded
````

---

## Role Naming Conventions

Use descriptive, scenario-based role names rather than generic user types:

| Instead of | Use |
|------------|-----|
| `user` | `primary-shopper`, `competing-bidder`, `new-signup` |
| `admin` | `responding-moderator`, `silent-admin` |
| `seller` | `established-seller`, `new-merchant`, `suspended-seller` |
| `friend` | `existing-friend`, `pending-request`, `blocked-user` |

This makes scenes self-documenting:

```typescript
scene('competing bidders', ({ actor }) => {
  const bidder1 = actor('primary-shopper')
  const bidder2 = actor('competing-bidder')
  // Clear what each actor represents
})
```

---

## Tips for Better LLM Results

### Provide your actual schema

The more context about your data model, the better:

```typescript
interface User {
  id: string
  email: string
  role: 'buyer' | 'seller' | 'admin'
  verified: boolean
  createdAt: Date
}
```

### Show existing patterns

If you have existing seeds, show them so the LLM matches your style:

```typescript
await db.user.createMany({
  data: [
    { id: 'u1', email: 'test@example.com', ... },
  ]
})
```

### Specify edge cases

Ask for actors that cover edge cases:

- Unverified user
- User with expired subscription
- Seller with no products
- Admin with limited permissions

### Request validation

Ask the LLM to verify:

> After generating, verify:
> - Every actor in every team file has a matching seed user
> - All relationship references are valid
> - Keys are consistent between team files and seeds

---

## Example Prompts by App Type

### SaaS / Multi-tenant

```markdown
I'm building a B2B SaaS with organization-based multi-tenancy.

**User types:** org owners, org admins, team members, external collaborators, super admins

**Relationships:** users belong to orgs, orgs have subscription tiers, users invited with specific roles, features gated by tier

Generate teams with:
- 'org-owner': Owner of a paid organization
- 'org-admin': Admin in that same org
- 'team-member': Regular member
- 'external-collaborator': Guest with project access
- 'competing-org-owner': Different org (isolation tests)
- 'free-tier-user': User on free plan (upgrade flows)
```

### Social Network

```markdown
I'm building a social platform with following, messaging, and content.

**User types:** regular users, verified users, moderators, suspended users

**Relationships:** following (one-directional), mutual follows, blocked, muted

Generate teams with:
- 'active-poster': Has posts and followers
- 'lurker': Follows but rarely posts
- 'mutual-friend': Mutual follow with active-poster
- 'blocked-user': Blocked by active-poster
- 'new-signup': Fresh account
- 'moderator': Content moderation access
```

### Marketplace

```markdown
I'm building a marketplace with sellers and buyers.

**User types:** buyers, sellers, admins

**Relationships:** buyers favorite sellers, sellers have listings, orders connect buyers/sellers, reviews connect buyers to products

Generate teams with:
- 'first-time-buyer': No orders
- 'returning-customer': Has history with established-seller
- 'established-seller': Multiple products, good reviews
- 'new-seller': Just verified, no products
- 'competing-seller': Same category
- 'dispute-moderator': Handles buyer/seller issues
```

### Content Platform

```markdown
I'm building a content platform with articles and publications.

**User types:** writers, editors, readers, admins

**Content states:** draft, in review, published, archived

**Relationships:** writers submit to publications, editors manage publications, readers follow writers

Generate teams with:
- 'prolific-writer': Published articles, followers
- 'new-writer': No published work
- 'publication-editor': Manages a publication
- 'engaged-reader': Follows writers, has bookmarks
- 'anonymous-reader': Not logged in
- 'site-admin': Platform administration
```

---

## After Generation

Once you have teams and seeds, use the **audit prompt** in [Building Good Teams](/guides/building-teams/#llm-instruction-audit-teams-against-seeds-and-scenes) to verify alignment between your scenes, teams, and seed data.
