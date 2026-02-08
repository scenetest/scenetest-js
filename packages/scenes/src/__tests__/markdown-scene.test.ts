import { describe, it, expect, beforeEach } from 'vitest'
import { parseMarkdownScenes, registerMarkdownScenes } from '../markdown-scene.js'
import { sceneRegistry } from '../scene.js'

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('parseMarkdownScenes', () => {
  it('parses a simple single-scene file with # heading', () => {
    const content = `
# User logs in

user:
openTo /login
see login-form
typeInto email alice@test.com
click submit
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/login.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('User logs in')
    expect(scenes[0].group).toBeUndefined()
    expect(scenes[0].blocks).toHaveLength(1)
    expect(scenes[0].blocks[0].role).toBe('user')
    expect(scenes[0].blocks[0].actions).toEqual([
      { type: 'action', line: 'openTo /login' },
      { type: 'action', line: 'see login-form' },
      { type: 'action', line: 'typeInto email alice@test.com' },
      { type: 'action', line: 'click submit' },
      { type: 'action', line: 'see dashboard' },
    ])
  })

  it('parses ## scenes with # groups', () => {
    const content = `
# Authentication flows

## user logs in successfully

user:
openTo /login
click submit

## user fails to log in

user:
openTo /login
see error-message
`
    const scenes = parseMarkdownScenes(content, '/test/auth.spec.md')
    expect(scenes).toHaveLength(2)

    expect(scenes[0].name).toBe('user logs in successfully')
    expect(scenes[0].group).toBe('Authentication flows')
    expect(scenes[0].blocks).toHaveLength(1)

    expect(scenes[1].name).toBe('user fails to log in')
    expect(scenes[1].group).toBe('Authentication flows')
    expect(scenes[1].blocks).toHaveLength(1)
  })

  it('handles multiple actor blocks in one scene', () => {
    const content = `
# two users chat

alice:
openTo /chat
see message-input
typeInto message-input Hello!
click send

bob:
openTo /chat
seeText Hello!
`
    const scenes = parseMarkdownScenes(content, '/test/chat.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].blocks).toHaveLength(2)
    expect(scenes[0].blocks[0].role).toBe('alice')
    expect(scenes[0].blocks[0].actions).toHaveLength(4)
    expect(scenes[0].blocks[1].role).toBe('bob')
    expect(scenes[0].blocks[1].actions).toHaveLength(2)
  })

  it('handles actor switching back to same actor', () => {
    const content = `
# friend request

alice:
openTo /friends
click search

bob:
openTo /notifications

alice:
click send-request
`
    const scenes = parseMarkdownScenes(content, '/test/friends.spec.md')
    expect(scenes).toHaveLength(1)
    // Three blocks: alice, bob, alice again
    expect(scenes[0].blocks).toHaveLength(3)
    expect(scenes[0].blocks[0].role).toBe('alice')
    expect(scenes[0].blocks[1].role).toBe('bob')
    expect(scenes[0].blocks[2].role).toBe('alice')
  })

  it('strips leading dash prefix from action lines', () => {
    const content = `
# test

user:
- openTo /login
- see login-form
- click submit
`
    const scenes = parseMarkdownScenes(content, '/test/dash.spec.md')
    expect(scenes[0].blocks[0].actions).toEqual([
      { type: 'action', line: 'openTo /login' },
      { type: 'action', line: 'see login-form' },
      { type: 'action', line: 'click submit' },
    ])
  })

  it('strips numbered list prefix from action lines', () => {
    const content = `
# test

user:
1. openTo /login
2. see login-form
3. typeInto email alice@test.com
4. click submit
`
    const scenes = parseMarkdownScenes(content, '/test/numbered.spec.md')
    expect(scenes[0].blocks[0].actions).toEqual([
      { type: 'action', line: 'openTo /login' },
      { type: 'action', line: 'see login-form' },
      { type: 'action', line: 'typeInto email alice@test.com' },
      { type: 'action', line: 'click submit' },
    ])
  })

  it('handles mixed list formats (plain, dash, numbered)', () => {
    const content = `
# test

user:
openTo /login
- see login-form
1. typeInto email alice@test.com
2. click submit
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/mixed.spec.md')
    expect(scenes[0].blocks[0].actions).toEqual([
      { type: 'action', line: 'openTo /login' },
      { type: 'action', line: 'see login-form' },
      { type: 'action', line: 'typeInto email alice@test.com' },
      { type: 'action', line: 'click submit' },
      { type: 'action', line: 'see dashboard' },
    ])
  })

  it('parses comments', () => {
    const content = `
# test

user:
openTo /login
// Fill in credentials
typeInto email test@test.com
`
    const scenes = parseMarkdownScenes(content, '/test/comments.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions).toHaveLength(3)
    expect(actions[0]).toEqual({ type: 'action', line: 'openTo /login' })
    expect(actions[1]).toEqual({ type: 'comment', text: 'Fill in credentials' })
    expect(actions[2]).toEqual({ type: 'action', line: 'typeInto email test@test.com' })
  })

  it('skips empty comments', () => {
    const content = `
# test

user:
openTo /
//
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/empty-comment.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions).toHaveLength(2)
  })

  it('parses if blocks with indented sub-actions', () => {
    const content = `
# test

user:
openTo /app
if welcome-modal
  click dismiss-button
  see dashboard
see main-content
`
    const scenes = parseMarkdownScenes(content, '/test/if.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions).toHaveLength(3)

    expect(actions[0]).toEqual({ type: 'action', line: 'openTo /app' })
    expect(actions[1]).toEqual({
      type: 'if',
      selector: 'welcome-modal',
      actions: ['click dismiss-button', 'see dashboard'],
    })
    expect(actions[2]).toEqual({ type: 'action', line: 'see main-content' })
  })

  it('strips dash prefix inside if blocks', () => {
    const content = `
# test

user:
if modal
  - click close
  - see content
see page
`
    const scenes = parseMarkdownScenes(content, '/test/if-dash.spec.md')
    const ifAction = scenes[0].blocks[0].actions[0]
    expect(ifAction).toEqual({
      type: 'if',
      selector: 'modal',
      actions: ['click close', 'see content'],
    })
  })

  it('parses macro invocations (no args)', () => {
    const content = `
# test

user:
login
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/macro.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions).toHaveLength(2)
    expect(actions[0]).toEqual({ type: 'macro', name: 'login', args: [] })
    expect(actions[1]).toEqual({ type: 'action', line: 'see dashboard' })
  })

  it('parses macro invocations with alias=role mapping', () => {
    const content = `
# test

primary-user:
searchForFriend target=new-user
`
    const scenes = parseMarkdownScenes(content, '/test/macro-args.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[0]).toEqual({
      type: 'macro',
      name: 'searchForFriend',
      args: [{ type: 'mapping', alias: 'target', role: 'new-user' }],
    })
  })

  it('parses macro invocations with multiple alias mappings', () => {
    const content = `
# test

admin:
setupFriendship user1=alice user2=bob
`
    const scenes = parseMarkdownScenes(content, '/test/macro-multi.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[0]).toEqual({
      type: 'macro',
      name: 'setupFriendship',
      args: [
        { type: 'mapping', alias: 'user1', role: 'alice' },
        { type: 'mapping', alias: 'user2', role: 'bob' },
      ],
    })
  })

  it('parses macro invocations with mixed mappings and literals', () => {
    const content = `
# test

admin:
setupEnv target=new-user some-literal-value
`
    const scenes = parseMarkdownScenes(content, '/test/macro-mixed.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[0]).toEqual({
      type: 'macro',
      name: 'setupEnv',
      args: [
        { type: 'mapping', alias: 'target', role: 'new-user' },
        { type: 'literal', value: 'some-literal-value' },
      ],
    })
  })

  it('parses bare click (no selector)', () => {
    const content = `
# test

user:
see notifications-badge
click
`
    const scenes = parseMarkdownScenes(content, '/test/bare-click.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[1]).toEqual({ type: 'action', line: 'click' })
  })

  it('parses seeInView action', () => {
    const content = `
# test

user:
openTo /
seeInView hero-banner
click get-started
`
    const scenes = parseMarkdownScenes(content, '/test/seeInView.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[1]).toEqual({ type: 'action', line: 'seeInView hero-banner' })
  })

  it('parses bare up (no selector)', () => {
    const content = `
# test

user:
see sidebar menu-item
click
up
see main-content
`
    const scenes = parseMarkdownScenes(content, '/test/bare-up.spec.md')
    const actions = scenes[0].blocks[0].actions
    expect(actions[2]).toEqual({ type: 'action', line: 'up' })
  })

  it('parses waitFor actions', () => {
    const content = `
# test

alice:
emit setup-done

bob:
waitFor setup-done
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/waitfor.spec.md')
    const bobActions = scenes[0].blocks[1].actions
    expect(bobActions[0]).toEqual({ type: 'action', line: 'waitFor setup-done' })
  })

  it('auto-creates scene if content appears before any heading', () => {
    const content = `
user:
openTo /
see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/no-heading.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('no-heading')
    expect(scenes[0].blocks).toHaveLength(1)
  })

  it('handles multiple # headings as separate scenes when no ## exists', () => {
    const content = `
# Scene one

user:
openTo /one

# Scene two

user:
openTo /two
`
    const scenes = parseMarkdownScenes(content, '/test/multi.spec.md')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].name).toBe('Scene one')
    expect(scenes[1].name).toBe('Scene two')
  })

  it('handles groups changing between scenes', () => {
    const content = `
# Auth flows

## login

user:
openTo /login

# Dashboard flows

## view dashboard

user:
openTo /dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/groups.spec.md')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].group).toBe('Auth flows')
    expect(scenes[1].group).toBe('Dashboard flows')
  })

  it('ignores lines before first actor declaration', () => {
    const content = `
# test

some random text that is not an action
more text

user:
openTo /
`
    const scenes = parseMarkdownScenes(content, '/test/preamble.spec.md')
    expect(scenes[0].blocks).toHaveLength(1)
    expect(scenes[0].blocks[0].actions).toHaveLength(1)
  })

  it('supports inline actor declaration with action', () => {
    const content = `
# user completes onboarding
new-user: openTo /
- see welcome-box
- click continue-button
- see onboarding-step
`
    const scenes = parseMarkdownScenes(content, '/test/inline.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('user completes onboarding')
    expect(scenes[0].blocks).toHaveLength(1)
    expect(scenes[0].blocks[0].role).toBe('new-user')
    expect(scenes[0].blocks[0].actions).toEqual([
      { type: 'action', line: 'openTo /' },
      { type: 'action', line: 'see welcome-box' },
      { type: 'action', line: 'click continue-button' },
      { type: 'action', line: 'see onboarding-step' },
    ])
  })

  it('supports block actor declaration (role-name:)', () => {
    const content = `
# test
primary-user:
- openTo /
`
    const scenes = parseMarkdownScenes(content, '/test/block-decl.spec.md')
    expect(scenes[0].blocks[0].role).toBe('primary-user')
  })

  it('auto-creates scene for role: syntax before any heading', () => {
    const content = `
user:
- openTo /
- see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/role-no-heading.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('role-no-heading')
    expect(scenes[0].blocks[0].role).toBe('user')
  })

  it('handles blank lines and whitespace gracefully', () => {
    const content = `

# test


user:

openTo /login

see form

`
    const scenes = parseMarkdownScenes(content, '/test/whitespace.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].blocks[0].actions).toHaveLength(2)
  })

  it('handles complex multi-actor multi-scene file', () => {
    const content = `
# User interactions

## new user gets friend request

new-user:
openTo /
see welcome-box
click continue-button

primary-user:
openTo /friends
click search
typeInto search-input query

new-user:
seeToast friend-request
see navbar notifications-badge
click

## old user re-activates

returning-user:
openTo /login
see login-form
`
    const scenes = parseMarkdownScenes(content, '/test/complex.spec.md')
    expect(scenes).toHaveLength(2)

    // First scene
    expect(scenes[0].name).toBe('new user gets friend request')
    expect(scenes[0].group).toBe('User interactions')
    expect(scenes[0].blocks).toHaveLength(3)
    expect(scenes[0].blocks[0].role).toBe('new-user')
    expect(scenes[0].blocks[0].actions).toHaveLength(3)
    expect(scenes[0].blocks[1].role).toBe('primary-user')
    expect(scenes[0].blocks[1].actions).toHaveLength(3)
    expect(scenes[0].blocks[2].role).toBe('new-user')
    expect(scenes[0].blocks[2].actions).toHaveLength(3)

    // Second scene
    expect(scenes[1].name).toBe('old user re-activates')
    expect(scenes[1].blocks).toHaveLength(1)
    expect(scenes[1].blocks[0].role).toBe('returning-user')
  })

  it('parses cleanup: directive before actor cues', () => {
    const content = `
## learner creates a new deck

cleanup: supabase.from('user_deck').delete().eq('uid', '[learner.key]').eq('lang', 'spa')

learner:
- openTo /learn
- see deck-list
`
    const scenes = parseMarkdownScenes(content, '/test/cleanup.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].cleanup).toBe(
      "supabase.from('user_deck').delete().eq('uid', '[learner.key]').eq('lang', 'spa')"
    )
    expect(scenes[0].blocks).toHaveLength(1)
    expect(scenes[0].blocks[0].role).toBe('learner')
  })

  it('ignores cleanup: after actor cues have started', () => {
    const content = `
# test

user:
- openTo /
cleanup: something
- see dashboard
`
    const scenes = parseMarkdownScenes(content, '/test/cleanup-late.spec.md')
    expect(scenes[0].cleanup).toBeUndefined()
    // cleanup: is treated as a macro since it's inside an actor block
  })

  it('handles cleanup: with no ## headings (# = scene)', () => {
    const content = `
# learner creates deck

cleanup: db.clear()

learner:
- openTo /
`
    const scenes = parseMarkdownScenes(content, '/test/cleanup-h1.spec.md')
    expect(scenes).toHaveLength(1)
    expect(scenes[0].cleanup).toBe('db.clear()')
  })

  it('supports cleanup: per scene in multi-scene file', () => {
    const content = `
# Deck management

## create deck

cleanup: supabase.from('decks').delete().eq('uid', '[learner.key]')

learner:
- openTo /decks
- click create

## delete deck

learner:
- openTo /decks
- click delete
`
    const scenes = parseMarkdownScenes(content, '/test/cleanup-multi.spec.md')
    expect(scenes).toHaveLength(2)
    expect(scenes[0].cleanup).toBe("supabase.from('decks').delete().eq('uid', '[learner.key]')")
    expect(scenes[1].cleanup).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Registration tests — role extraction
// ---------------------------------------------------------------------------

describe('registerMarkdownScenes', () => {
  beforeEach(() => {
    sceneRegistry.length = 0
  })

  it('extracts unique roles from actor blocks', () => {
    const scenes = parseMarkdownScenes(`
# two users chat

alice:
openTo /chat
typeInto message-input Hello!
click send

bob:
openTo /chat
seeText Hello!
`, '/test/chat.spec.md')

    registerMarkdownScenes(scenes, '/test/chat.spec.md')

    expect(sceneRegistry).toHaveLength(1)
    expect(sceneRegistry[0].roles).toEqual(['alice', 'bob'])
  })

  it('deduplicates roles when same actor appears in multiple blocks', () => {
    const scenes = parseMarkdownScenes(`
# friend request

alice:
openTo /friends

bob:
openTo /notifications

alice:
click send-request
`, '/test/dedup.spec.md')

    registerMarkdownScenes(scenes, '/test/dedup.spec.md')

    expect(sceneRegistry).toHaveLength(1)
    expect(sceneRegistry[0].roles).toEqual(['alice', 'bob'])
  })

  it('extracts roles for each scene in multi-scene files', () => {
    const scenes = parseMarkdownScenes(`
# Auth flows

## admin promotes user

admin:
openTo /admin
click promote

user:
see promoted-badge

## user views profile

user:
openTo /profile
see profile-form
`, '/test/multi-roles.spec.md')

    registerMarkdownScenes(scenes, '/test/multi-roles.spec.md')

    expect(sceneRegistry).toHaveLength(2)
    expect(sceneRegistry[0].roles).toEqual(['admin', 'user'])
    expect(sceneRegistry[1].roles).toEqual(['user'])
  })
})
