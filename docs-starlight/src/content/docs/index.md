---
title: Scenetest JS
description: Scene-driven, concurrent-actor end-to-end testing for Vite apps, with inline runtime checks and simple multi-actor markdown specs.
template: splash
hero:
  tagline: Scene-driven, concurrent-actor end-to-end testing for Vite apps, with inline runtime checks and simple multi-actor markdown specs.
  actions:
    - text: Get Started
      link: /guides/getting-started/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/scenetest/scenetest-js
      icon: external
      variant: minimal
---

# Scenetest JS

> Scenetest is a scene-driven end-to-end test framework for Vite, with inline
runtime checks and simple multi-actor markdown specs. Test your product and your
mental model, not your tests 🎬

## Intro

It's 2026, and end-to-end testing could use a refresh.
We build apps differently now: Tanstack Query/Tanstack DB, normalised cache, Zustand, localDb, PGlite...
This _middle layer_ is taking on more and more of the app logic and UX management for our products.

But generally the idea of an &ldquo;E2E test&rdquo; is rooted firmly in what we can see on the DOM or grab off the window object –
it's still somewhere between annoying and impossible to test changes in the _middle layer_
like my query cache or Zustand store, where we're actually building.
So we started thinking of &ldquo;End to End&rdquo; as a bit of a misnomer, describing two very different domains:

1. **Scene Scripts**: Driving the test user's browser from beginning of a task/journey/scene to the end e.g.: _user logs in,
sees the form, submits the form, expects a toast and a redirect._
2. **Integrity Checks**: Validating that state agrees across different computers/contexts, e.g.: _by the time my `onSettled` callback fires, my local collection and database record should match._

## Inline Checks to Validate the Mental Picture

This is where we started: I wanted to be able to test the &ldquo;middle stack&rdquo; and that meant calling tests
from _inside_ the client code.

 So we wrote little logging functions `should` and `failed` that report
data to a little observer panel, and feels a bit like `console.log('local DB should match server record:', booleanExpr)`.


<figure class="screenshot">
	<img src="/images/screenshot-4.png" alt="Scenetest dev panel showing inline assertions from React components" />
	<figcaption>The dev panel collects should/failed assertions from your inline assertions in your components, effects, and callbacks whenever they execute.</figcaption>
</figure>

This is fine to do because _Scenetest_ is primarily a Vite plugin, and it strips all your
Scenetest functions from your production build. Zero production footprint (not even a `window.__profileCollection = profileCollection`).

But like we said, our true goal here is to be able to call these checks inside the component or
callback or effect, but _run them on the server_, like Playwright's `page.evaluate`, but in reverse.
So we built `serverCheck` which (in dev only) bundles a function as an RPC endpoint and allows your client code
to call that API using local app state as its inputs. Like this:

```ts
function EditPostComponent({ id }) {
  const thePost = usePost(id)
  const postMutation = useMutation({
    mutationFn: postFn,
    onSuccess: someFn,
    onSettled: (data, error) => {
      // ✔ check runs on client, reports to the collector
      if (!error) should(
        'Return data should be new',
        data.updated_at > thePost.updated_at
      )
      // ✔ bundled as a server function when running in dev
      serverCheck(
        'Post item should match in local DB and server DB',
        async (server, { data, localPost }) => {
          const dbPost = await server.getPost(data.id)
          should(
            'primary fields should match',
            match(
              [localPost.title, dbPost.title],
              [localPost.content, dbPost.content],
              [localPost.updated_at, dbPost.updated_at],
            )
          )
        },
        // pass local app data to the server fn
        () => ({
          data,
          localPost: server.getPost(data.id)
        })
      )
    }

  })

  return <FormComponent post={thePost} mutation={postMutation} />
}
```

That all gets stripped from the production bundle by the Vite plugin, but in dev or test mode,
it runs every time the mutation settles, checking the feature's implementation details and state changes, and making
cute little noises at you from the reporting panel (optional).

## Scenes You Can Read, Write and Reason About

With the precision and confidence we get from these inline checks, we can turn our attention back to the other domain: **Scene scripts can be so much simpler now.**

When the spec doesn't have to count and evaluate and compare, you can focus on the basics: which seed-user are we using, what do they see, what do they click, what do they expect. We started working on ways to manage multi-actor scene scripts and found that the vast majority of our spec coverage to date could be expressed using a very simple,
declarative DSL, with no async/await, simple enough you can write your spec in markdown:

```text
<!-- Markdown Concurrent -->
<!-- scenes/friend-request.spec.md -->
## User sends and receives a friend request

new-friend: openTo /home

main-user-1:
- openTo /search-users
- typeInto search-input [new-friend.username]
- click live-results-box [new-friend.key] send-request-btn

new-friend:
- seeToast friend-request-notice
- see site-navbar notifications-menu
- click menu-trigger
- click friend-request-from-[main-user-1.key] accept-btn

main-user-1: seeToast friend-request-accepted
```

```ts
// Typescript Concurrent
// scenes/friend-request.spec.ts
scene(
  'User sends and receives a friend request',
  ({ actor }) => {
    const user1 = actor('main-user-1')
    const friend = actor('new-friend')

    user1.openTo('/search-users')
      .typeInto('search-input', friend.username)
      .click(`live-results-box ${friend.key} send-request-btn`)

    friend.openTo('/')
      .seeToast('friend-request-notice')
      .see('site-navbar notifications-menu')
      .click('menu-trigger')
      .click(`friend-request-from-${user1.key} accept-btn`)

    user1.seeToast('friend-request-accepted')
  }
)
```

```ts
// Typescript Sequential
// scenes/friend-request.spec.ts
test(
  'User sends and receives a friend request',
  async ({ actor }) => {
    const user1 = await actor('main-user-1')
    const friend = await actor('new-friend')

    await user1.openTo('/search-users')
    await friend.openTo('/')

    await user1.typeInto('search-input', friend.username)
    await user1.click(`live-results-box ${friend.key} send-request-btn`)

    await friend.seeToast('friend-request-notice')
    await friend.see('site-navbar notifications-menu')
    await friend.click('menu-trigger')
    await friend.click(`friend-request-from-${user1.key} accept-btn`)

    await user1.seeToast('friend-request-accepted')
  }
)
```

In the example above, the first two specs are both describing "Concurrent" scene flows –
one uses Typescript to do it, and the other uses Markdown, but they both resolve to the
same set of instructions and run identically.

Each actor builds a single action queue,
and then works through their own action queue, with each queue awaiting some instruction
to the browser driver, and then passing its scope and history on to the next step. Each
actor handle works sequentially as far as it can go until it completes the list, or waits
and polls the DOM for any changes that might allow it to continue (like the appearance
of the button we've been waiting to click).

In this mode, there's no difference between the roughly-ordered markdown you see above and this fully sorted version here:

```text
<!-- Markdown Concurrent -->
## User sends and receives a friend request

main-user-1:
- openTo /search-users
- typeInto search-input [new-friend.username]
- click live-results-box [new-friend.key] send-request-btn
- seeToast friend-request-accepted

new-friend:
- openTo /home
- seeToast friend-request-notice
- see site-navbar notifications-menu
- click menu-trigger
- click friend-request-from-[main-user-1.key] accept-btn
```

That's because the scene is not running these actions and awaiting their consequences: it's building the queue. Then when
it's time to run the scene, each actor will advance as far as the DOM allows, and then wait and poll for their next step.
But we don't have to write this logic in the spec; the framework handles it for us; we just have to write who does what
and what they expect, roughly in order.

## Try it Out

There's a lot more we could say about _Scenetest_ – we could talk about the finer points of the selector API,
about aliases, macros, failures that "settle," swarm mode, the scene recorder, the reporting dashboard, and more! But you've gotten
through the main highlights: inline checks that validate your mental model from inside the app, and scene specs that
drive the browser through all your happy paths and edge cases.

Below are the guides and references to get you going, starting with [the Getting Started guide](/guides/getting-started/) which walks you through installation, your first inline check, and your first markdown spec – happy testing!

### Guides

- [Getting Started](/guides/getting-started/) – install Scenetest, add your first check, write your first spec
- [Writing Scene Specs](/guides/writing-scene-specs/) – all three authoring styles, scope navigation, coordination, and the collaboration loop
- [Writing Inline Assertions](/guides/writing-inline-assertions/) – `should()`, `failed()`, `serverCheck()`, and framework-specific hooks like `useServerCheck` and `createServerCheck`.
- [Building Good Teams of Actors](/guides/building-teams/) – designing teams that mirror your seed data, scaling concurrency

Or find detailed references on the [Actor handle](/reference/actor-api/), [DOM selectors](/reference/selectors/), [The markdown DSL Format](/reference/text-dsl/), [Concurrent and Classic Mode](/reference/concurrent-and-classic/), and the full [CLI Reference](/reference/cli/).
