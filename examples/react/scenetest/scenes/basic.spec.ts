import { test } from '@scenetest/scenes'

test('user can see the welcome page', async ({ actor }) => {
  const user = await actor('user')

  // Navigate to the app
  await user.openTo('/')

  // Should see the main UI elements
  await user.see('display-name')
  await user.see('name-input')
})

test('user can update their name', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/')

  // Type a new name
  await user
    .see('name-input')
    .typeInto('name-input', 'New Name')
    .click('submit-button')

  // Should see the updated display
  await user.seeText('New Name')
})

test('saving a reserved name triggers an expected console error', async ({ actor }) => {
  const user = await actor('user')

  await user.openTo('/')

  // The server rejects the reserved name "taken" with a 409, which the app
  // logs to the console. expectConsoleError asserts that error happened (and
  // fails the scene if it didn't), instead of it surfacing as a problem.
  // "name-taken" resolves to the alias defined in scenetest/config.ts; you can
  // also pass a raw substring or a RegExp.
  await user
    .see('name-input')
    .typeInto('name-input', 'taken')
    .click('submit-button')
    .expectConsoleError('name-taken')
    .see('error')

  await user.seeText('already in use')
})
