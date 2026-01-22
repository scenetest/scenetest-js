import { expect } from '@playwright/test'
import { actorsTest, actors } from 'playwright-scenetest'

/**
 * Example multi-actor tests demonstrating the actors API.
 *
 * These tests show how multiple users can interact with the same
 * application simultaneously, waiting for each other's actions.
 */

actorsTest.describe('multi-actor tests', () => {
  actorsTest('two actors can navigate independently', async ({ actorFactory }) => {
    // Create two actors (users)
    const [user1, user2] = actors(actorFactory, 2)

    // Both actors navigate to the app
    await user1.openBrowserTo('/')
    await user2.openBrowserTo('/')

    // Verify both pages loaded
    await user1.page.waitForSelector('[data-testid="display-name"]')
    await user2.page.waitForSelector('[data-testid="display-name"]')

    // Each actor has their own page and assertion collection
    expect(user1.page).not.toBe(user2.page)
  })

  actorsTest('actors can use chainable API', async ({ actorFactory }) => {
    const [user] = actors(actorFactory, ['alice'])

    // Using chainable API for navigation and assertions
    await user.openBrowserTo('/')

    // Chain multiple actions together
    const chain = user
      .seeId('display-name')
      .seeId('name-input')
      .clickId('submit-button')

    await chain.execute()
  })

  actorsTest('actors can communicate via message bus', async ({ actorFactory }) => {
    const [sender, receiver] = actors(actorFactory, ['sender', 'receiver'])

    // Navigate both actors
    await sender.openBrowserTo('/')
    await receiver.openBrowserTo('/')

    // Set up a promise for the receiver to wait
    const receiverGotMessage = new Promise<void>((resolve) => {
      receiver.watchFor('sender-ready', async () => {
        resolve()
      })
    })

    // Sender performs action and emits message
    await sender.seeId('display-name').thenEmit('sender-ready').execute()

    // Receiver waits for the message
    await receiverGotMessage
  })

  actorsTest('actors collect scenetest assertions independently', async ({ actorFactory }) => {
    const [user1, user2] = actors(actorFactory, 2)

    await user1.openBrowserTo('/')
    await user2.openBrowserTo('/')

    // Wait for assertions to be collected
    await user1.page.waitForSelector('[data-testid="display-name"]')
    await user2.page.waitForSelector('[data-testid="display-name"]')
    await user1.page.waitForTimeout(100)
    await user2.page.waitForTimeout(100)

    // Each actor has their own assertions
    expect(user1.page.assertions.length).toBeGreaterThan(0)
    expect(user2.page.assertions.length).toBeGreaterThan(0)
  })

  actorsTest('watchFor with string trigger waits for message', async ({ actorFactory }) => {
    const [user1, user2] = actors(actorFactory, 2)

    await user1.openBrowserTo('/')
    await user2.openBrowserTo('/')

    let user1SawConfirmation = false

    // User1 watches for a message from user2
    user1.watchFor('user2-did-something', async (chain) => {
      user1SawConfirmation = true
      await chain.seeId('display-name').execute()
    })

    // Give a moment for watchFor to register
    await user1.page.waitForTimeout(50)

    // User2 performs action and emits
    await user2.seeId('display-name').thenEmit('user2-did-something').execute()

    // Wait for the chain reaction
    await user1.page.waitForTimeout(100)

    expect(user1SawConfirmation).toBe(true)
  })

  actorsTest('complex multi-actor scenario with named users', async ({ actorFactory }) => {
    // Create actors with meaningful names for readability
    const [alice, bob] = actors(actorFactory, ['alice', 'bob'])

    // Both users open the app
    await alice.openBrowserTo('/')
    await bob.openBrowserTo('/')

    // Verify actor properties
    expect(alice.username).toBe('alice')
    expect(bob.username).toBe('bob')
    expect(alice.id).toBe('actor1')
    expect(bob.id).toBe('actor2')

    // Set up Alice to react when Bob does something
    let aliceReacted = false
    alice.watchFor('bob-clicked-submit', async () => {
      aliceReacted = true
    })

    // Bob performs an action
    await bob.seeId('display-name').execute()
    await bob.clickId('submit-button').thenEmit('bob-clicked-submit').execute()

    // Wait for Alice's reaction
    await alice.page.waitForTimeout(100)

    expect(aliceReacted).toBe(true)
  })
})

/**
 * Example of a realistic friend request scenario (pseudo-test)
 *
 * This demonstrates the syntax from docs/ideas.md
 * Note: This test would need a real app with friend request functionality
 */
actorsTest.skip('friend request flow (example syntax)', async ({ actorFactory }) => {
  const [user1, user2] = actors(actorFactory, ['alice', 'bob'])

  // User1 navigates to friend search and sends a request
  await user1.openBrowserTo(`/friends/search?q=${user2.username}`)
  await user1.seeId(`item-${user2.id}`).clickId('send-friend-request').execute()

  // User1 sets up a watch for when user2 accepts
  user1.watchFor(
    'user2 accepts request',
    async (chain) =>
      chain.thenSeeId('alert-new-friend-confirmed').click('a').thenSeeId('friend-management-page-container').execute()
  )

  // User2 receives the request and accepts it
  await user2
    .thenSeeId('alert-new-friend-request')
    .clickId('button-goto')
    .thenSeeId('friend-management-page-container')
    .getById(`friend-item-${user1.id}`)
    .clickId('accept-friend')
    .thenEmit('user2 accepts request')
    .execute()

  // Verify both users ended up in the right state
  await user1.seeId('friends-list-container').thenReadText(user2.username).execute()
  await user2.seeId('friends-list-container').thenReadText(user1.username).execute()
})
