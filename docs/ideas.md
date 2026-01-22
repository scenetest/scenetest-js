
### 1. "Settling" failed tests

a failing test creates a followup and if it "settles" in a subsequent tick then we'll report it differently. (maybe this is a feature of the reporting interface only and not a change to the runtime.) we will understand these things differently as e.g. a state change triggered by an effect triggered by a state change, and will help alert us of key details of how the system is working, help train our intuition and understanding, long-term of how our framework works.

### 2. Cloud service that shows you the branches/merges that added/removed problems

offer a cloud service that runs your tests across different branches of your thing and allows you to see where bugs are being introduced, wrapped up, where test coverage might be lacking, where problems and solutions are "flowing" through different parts of the code base / project / team. offer key insights targeted to specific developers.

### 3. write example docs of script-driven development

Many find test-driven development to be unwieldy, interfering with the flow of good coding and sometimes tricking you into focusing on perfection too soon. But _Scenetest_ splits the assertions from the scripts, and this can have a big impact on what we even mean by "Test Driven Development". We should offer some explanation of "script driven development" where you script things in very human terms like "the person will see a confirmation" and we sort of come up with a little AI agent context instruction for an AI agent to write those as scene specs and then spit out a list for the developer "please add these test IDs and classes in the app code".

And then your tests will be HUMAN READABLE. So then _Script Driven Development_ actually starts to feel like a viable way to work. The inline assertions will be written as needed by the engineer, so not "driving" the process but supporting it and solidifying it; putting the safety harnesses in place as we go. But/so the scripts can be simple simple simple.

Here is an example of a scene where a user logs in and sends a friend request, and then the other user receives it and accepts it, and both users see the confirmation -- no implementation details, just user story, expectation, affordance, action:

```
// /scenes/sending-and-receiving-friend-requests.spec.ts
const [ user1, user2 ] = personas()

// the user takes action!
user1.openBrowserTo(`/friends/search?=${user2.username}`)
user1.seeId(`item-${user2.id}`).clickId('send-friend-request')

// register a callback from the user's perspective, before the thing happens
user1.watchFor(
	() => user1.thenSeeId('alert-new-friend-confirmed'),
	'user2 accepts request',
)

user2
  .thenSeeId('alert-new-friend-request')
	  .clickId('button-goto')
   .thenSeeId('friend-management-page-container')
	  .getById(`friend-item-${user1.id}`)`
		.clickId('accept-friend')
		.fire()

// these are just `when arg1 happens, do arg2`, when either arg is a string it just means
// when it appears on the message bus and/or put this message on the bus.
user1.watchFor(
	'user2 accepts request',
	async (node) =>
	  node.click('a')
		  .thenSeeId('friend-management-page-container')
			.thenSeeId('friends-list-container')
			.thenReadText(user2.username)
  )
```

This is a complete spec for a user journey, and the way it's written implies that no refreshes are needed for the user1 to receive the notification, click it, and see a new friend in their friends list. And also nothing is specified about the implementation of the steps, or even the text on the page! We know we want to see _some_ kind of friend management page container but the person writing the test doesn't exactly care what it is for the test to succeed. But the dev will see a
`<div data-testid="friends-list-container">` and they will know there is some expectation of stability that the friends list container will be on this route, where it is right now, and not in another place or context. This also makes it something of a harness that you can use in LLM-driven development to create meaningful instructions for them but also to _really_ leave them alone to do their thing.


### 4. We can directly profile commonest paths, which things render the most time, etc. We could assign "cost" to different render moments or refresh profiles based on this. the observability potential upside feels huge
