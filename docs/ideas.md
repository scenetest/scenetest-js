
### 1. "Settling" failed tests

a failing test creates a followup and if it "settles" in a subsequent tick then we'll report it differently. (maybe this is a feature of the reporting interface only and not a change to the runtime.) we will understand these things differently as e.g. a state change triggered by an effect triggered by a state change, and will help alert us of key details of how the system is working, help train our intuition and understanding, long-term of how our framework works.

### 2. Cloud service that shows you the branches/merges that added/removed problems

offer a cloud service that runs your tests across different branches of your thing and allows you to see where bugs are being introduced, wrapped up, where test coverage might be lacking, where problems and solutions are "flowing" through different parts of the code base / project / team. offer key insights targeted to specific developers.

### 3. write example docs of script-driven development

Many find test-driven development to be unwieldy, interfering with the flow of good coding and sometimes tricking you into focusing on perfection too soon. But _Scenetest_ splits the assertions from the scripts, and this can have a big impact on what we even mean by

Splitting the assertions from the script makes _script-driven development_ actually really viable and potentially easy, even for devs or workflows where they find TDD to be unwieldy or stifling to creative flow. But a script-driven approach is kind of a great way to think about building interfaces in the first place "user2 will log in; and they'll see a notice about the new friend request, and click a button to go view it, and see a list of any new friend requests, and find the other user's username in that list, and click the success-y button in that item, and then the other user, user 1, will receive a success-y alert, and click it, and see their friends list, and the first item on the list will have user2's username in it." This is all very high-level stuff, but if the script is approved it can be very easily converted into a Scene spec, using `data-testid` and `data-testclass` throughout the markup to spot things like "an alert appears" without having to say exactly what text or colour we are looking for. This approach to TDD is just the same as writing some good happy-path user stories as you get started. That doesn't feel so unwieldy to me. And then as you _write the components_ you put in your inline assertions; but this isn't TDD it's more test-as-you-go. So this sense of "frontloading tests" is muted a bit. You frontload your _script_ and then when you write the features you'll just put in whatever inline assertions help you build the feature and debug it as it comes together. Often times we put in a bunch of "if xyz, console log something" -- now you can use scenetest statements, and you don't even have to take them out when you merge the branch!

Here is an example of the above script written in a SDD kind of way -- no implementation details, just user story, expectation, affordance, some organization:

```
// /scenes/sending-and-receiving-friend-requests.scene.ts

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
`<div data-testid="friends-list-container">` and they will know there is some expectation of stability that the friends list container will be on this route, where it is right now, and not in another place or context. If you're thinking of changing that, go talk to someone. So this kind of very high-level scene orchestration, with multi-user concurrency and a sort of continuous flow -> see this content, see the item you want, click the button inside that item, then expect to find some div on the next page that purports to be an explanation. etc. this is a good high-level approach to designing good user journeys, and if we can develop Scene coordination scripts that mirror these semantics and the mechanistic user-tester-centric approach, I think we could get LLMs to be _very good_ at writing these tests. We will want to document the methods and make it easy to feed examples to the AI, and we will design a nice API and not give many ways to do things.


### 4. We can directly profile commonest paths, which things render the most time, etc. We could assign "cost" to different render moments or refresh profiles based on this. the observability potential upside feels huge
