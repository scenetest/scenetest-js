import { scene } from '@scenecheck/scenes'

scene('user can see the welcome page', async ({ actor }) => {
  const user = await actor('user')

  // Navigate to the app
  await user.openTo('/')

  // Should see the main UI elements
  await user.see('display-name')
  await user.see('name-input')
})

scene('user can update their name', async ({ actor }) => {
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
