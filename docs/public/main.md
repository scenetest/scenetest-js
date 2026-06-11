
# Scenetest JS

> Scenetest is a testing framework for modern, client-first apps that splits end-to-end testing into two parts: simple markdown specs to run through your features, and a Vite plugin that executes integrity checks across the server-client boundary to validate your mental model for how it all works.

## Intro

It's 2026, and end-to-end testing could use a refresh.
We build apps differently now: Tanstack Query/Tanstack DB, normalised cache, Zustand, localDb, PGlite...
This _middle layer_ is taking on more and more of the app logic and UX management for our products.

But generally the idea of an &ldquo;E2E test&rdquo; is rooted firmly in what we can see on the DOM or grab off the window object &mdash;
it's still somewhere between annoying and impossible to test changes in the _middle layer_
like my query cache or Zustand store, where we're actually building.
So we started thinking of &ldquo;End to End&rdquo; as describing two very different conceptual domains:

1. **Scene orchestration** &mdash; how your test user traverses your app: what they click, what they type, what they expect to see. _User logs in, sees the form, submits, expects a toast and a redirect._
2. **Integrity checks** &mdash; how you know it's actually working under the hood: that server state got updated, that your cache is consistent, that client and server agree. _By the time my `onSettled` callback fires, my local collection and database record should match._

## Scenes You Can Read, Write and Reason About

A scene spec is written in a simple Markdown format. No async/await, no imports, no boilerplate. Just who does what and what they expect:

```scenetest
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

That's a complete, runnable scene spec. Each actor gets a queue of actions. The framework runs all actors concurrently &mdash; no `Promise.all`, no race conditions. Actions like `see` and `seeToast` naturally poll the DOM, so actors synchronize through the application itself.

In fact, there's no runtime difference between the interleaved ordering above and this fully sorted version:

```scenetest
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
We just have to write who does what and what they expect, roughly in order.

> If you need full TypeScript control, the same spec can be written as a `.spec.ts` file &mdash; see [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic).

## Inline Checks to Validate the Mental Picture

With the precision and confidence we get from simple scene specs, we can focus on the other domain: **testing our mental model for how the moving pieces fit together while our actors are using the app.**

We wrote little logging functions `should` and `failed` that you place directly in your components, callbacks, and effects. They report
data to an observer panel, and feel a bit like `console.log('local DB should match server record:', booleanExpr)`.


<figure class="screenshot">
	<img src="/images/screenshot-4.png" alt="Scenetest dev panel showing inline assertions from React components" />
	<figcaption>The dev panel collects should/failed assertions from your inline assertions in your components, effects, and callbacks whenever they execute.</figcaption>
</figure>

This is fine to do because _Scenetest_ is primarily a Vite plugin, and it strips all your
Scenetest functions from your production build. Zero production footprint (not even a `window.__profileCollection = profileCollection`).

The real power of inline checks shows up in your mutation callbacks, effects, and event handlers &mdash; the places where external test frameworks can't easily reach:

```tsx
import { should, serverCheck, match } from '@scenetest/checks/react'

function EditPostForm({ post }) {
  const queryClient = useQueryClient()
  const updatePost = useMutation({
    mutationFn: (data) => api.updatePost(post.id, data),
    onSettled: (returnData, error) => {
      if (error) return
      const cached = queryClient.getQueryData(['post', post.id])

      // runs on client, reports to the collector
      should('return data should be newer than original',
        returnData.updated_at > post.updated_at
      )

      // bundled as a server action, compares client & server state
      serverCheck(
        'Post should match across client and server',
        async (server, { postId, localPost }) => {
          const dbPost = await server.getPost(postId)
          should('fields should match', match(
            [localPost.title, dbPost.title],
            [localPost.updated_at, dbPost.updated_at],
          ))
        },
        () => ({ postId: post.id, localPost: cached })
      )
    },
  })

  return <form>...</form>
}
```

That all gets stripped from the production bundle by the Vite plugin, but in dev or test mode,
it runs every time the mutation settles, checking the feature's implementation details and state changes, and making
cute little noises at you from the reporting panel (optional).

## Try it Out

There's a lot more we could say about _Scenetest_ &mdash; we could talk about the finer points of the selector API,
about aliases, macros, failures that "settle," swarm mode, the scene recorder, the reporting dashboard, and more! But you've gotten
through the main highlights: a Markdown spec format for scenes that drive the browser through all your happy paths and edge cases, and inline checks that validate your mental model from inside the app.

Below are the guides and references to get you going, starting with [the Getting Started guide](/guides/getting-started) which walks you through installation, your first markdown spec, and your first inline check &mdash; happy testing!

### Guides

- [Getting Started](/guides/getting-started) &mdash; install Scenetest, write your first spec, add your first check
- [Writing Scene Specs](/guides/writing-scene-specs) &mdash; scope navigation, coordination, conditional handling, and the collaboration loop
- [Writing Inline Assertions](/guides/writing-inline-assertions) &mdash; `should()`, `failed()`, `serverCheck()`, and framework-specific hooks like `useServerCheck` and `createServerCheck`.
- [Building Good Teams of Actors](/guides/building-teams) &mdash; designing teams that mirror your seed data, scaling concurrency

Or find detailed references on [DOM selectors](/reference/selectors), the [Markdown Spec Reference](/reference/text-dsl), [TypeScript Scenes & Playwright Specs](/reference/concurrent-and-classic), and the full [CLI Reference](/reference/cli).
