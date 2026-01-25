import { scene } from '@scenetest/cli'

scene('user can see the welcome page', async ({ cast }) => {
  const user = await cast('user')

  // Navigate to the app
  await user.goto('/')

  // Should see the main UI elements
  await user.see('display-name')
  await user.see('name-input')
})

scene('user can update their name', async ({ cast }) => {
  const user = await cast('user')

  await user.goto('/')

  // Type a new name
  await user
    .see('name-input')
    .typeInto('name-input', 'New Name')
    .click('submit-button')

  // Should see the updated display
  await user.seeText('New Name')
})
