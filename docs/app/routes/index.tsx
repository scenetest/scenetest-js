import { createFileRoute, Link } from '@tanstack/react-router'
import { CodeBlock } from '../components/CodeBlock'
import { Footer } from '../components/Footer'
import { useTestAssertions } from '../useTestAssertions'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  // Enable interactive test assertions for the demo
  useTestAssertions()

  return (
    <article>
      <div className="hero-logo">🎬</div>
      <h1>Scenetest</h1>
      <p className="subtitle">
        Local-First testing framework for Vite apps that helps you evaluate your
        product and your mental model &ndash; not your tests.
      </p>

      <p>
        It's 2026; we build apps differently now. Component state, Query cache, Zustand store,
        Tanstack/DB, Electric SQL, DuckDB in WASM with React bindings... the <em>Local First</em>{' '}
        possibilities are endless, and they're helping us build buttery smooth, responsive UIs.
      </p>
      <p><strong>Test tooling should keep up.</strong></p>

      <p>
        Most frameworks rely on a headless browser clicking around our app, inputting
        inputs into inputs and clicking clickers and expecting to see certain expectations. If we're
        being <em>very thorough</em> we might check the database directly to be sure something updated
        (for realsies).
      </p>
      <p>
        The DOM and the Database are good book-ends to compare, but if the main data store in your app is
        a local DB or cache, it feels like you're not really testing your app until you're able to make
        assertions about how your local state compares.
      </p>

      <p className="divider">* * *</p>

      <p>
        This is how <em>Scenetest</em> came about. We were looking for tests that would:
      </p>
      <ol>
        <li>Evaluate data we take from inside the React component lifecycle: in onSettled callbacks, in effects, hooks.</li>
        <li>Compare it to what we expect to find in the database or other privileged resources.</li>
        <li>Write both with full type safety, intellisense, etc., so your tests work <em>with</em> your types.</li>
      </ol>
      <p>
        Thankfully, in 2026 React world, we have a primitive that matches this pattern
        neatly: <strong>Server Actions</strong>, which are written in the app, stripped by the
        bundler, deployed on the server as an RPC function, and called remotely from the client.
        This inversion of control solves the multi-context app⇔server problem,
        giving the app control over when to call the server function and what data to pass it,
        but actually running it in a protected/privileged environment.
      </p>
      <p>
        Apply this pattern to a testing framework, and we get a powerful tool for testing our expectations
        about nearly every layer of an application in one place.
      </p>

      <CodeBlock>{`// in your UI component
const post = usePost(id)
const form = usePostForm(post)
// useTestEffect wraps test code that gets stripped in production
useTestEffect(() => {
  // skip when submitting, run when only finished
  if (form.isSubmitting) return

  assert(
    'Server item should match local',
    async (server, data) => {
      const post = await server.getPosts(app.id)
      if (!post) failed('title is empty')
      should('titles match', post.title === app.title)
    },
    // passing data from react-land to the server fn
    () => postsCollection.get(id)
  )
}, [form.isSubmitting, post.title])`}</CodeBlock>

      <h2>Scenes and Inline Assertions</h2>

      <p>
        <strong>Scenes</strong> are small user journeys, the atomic units of a user flow you want to test.
        <em>e.g.</em> <code>scenes/profile-update.spec.ts</code> or <code>scenes/profile-update.spec.md</code>: <em>Log in, navigate to settings, change your username,
        submit the form, see the success message.</em> Scenes are about orchestration &ndash; driving the
        browser through a sequence of interactions. You can write them in TypeScript or
        in <strong>plain markdown</strong> that reads like documentation &ndash; writing a scene shouldn't
        require technical knowledge for how the features are implemented.
      </p>

      <CodeBlock>{`// scenes/profile-update.spec.ts
import { flow } from '@scenetest/cli'

flow('user updates their profile', ({ actor }) => {
  const user = actor('user')

  user.openTo('/profile')
  user
    .see('profile-form')
    .typeInto('name-input', 'New Name')
    .click('save-button')
  user.seeText('New Name')
  // That's it. All the inline assertions fired automatically.
})`}</CodeBlock>

      <p>
        Or write it as plain <strong>markdown</strong> — human-readable, GitHub-renderable, and executable:
      </p>

      <CodeBlock>{`<!-- scenes/profile-update.spec.md -->
# user updates their profile

actor user
openTo /profile
see profile-form
typeInto name-input New Name
click save-button
seeText New Name`}</CodeBlock>

      <p>
        <strong>Inline Assertions</strong> are test statements that live inside your application
        code &ndash; in your components, hooks, and callbacks. They validate your mental model: "at this point in the code / React lifecycle,
        this data should be in this state." Engineers write them to encode their understanding of how and why this works, and to alert
        future generations if they are ever running afoul of their ancient wisdom.
        Use <code>should</code> or <code>failed</code>, or multi-context assertions with <code>assert</code> inside <code>useTestEffect</code>.
      </p>

      <CodeBlock>{`import { should, failed, assert, useTestEffect } from '@scenetest/react'

export function ProfileForm({ userId }) {
  const { data: profile } = useProfile(userId)

  // Runs every render, with the actual value, at the actual moment
  should('Profile available without loading state', profile !== undefined)

  // For special cases, an extra check
  useTestEffect(() => {
    if (profile) return // only check when no profile

    assert(
      'no profile returned means no profile exists',
      async (server) => {
        if (await server.getProfile(userId)) failed('profile DOES exist!')
      }
    )
  }, [profile, userId])

  return !profile ? <CreateProfileForm />
    : <EditProfileForm profile={profile} />
}`}</CodeBlock>

      <p>
        Moving Assertions into the application code means they're type-safe out of the box,
        they run passively even as you just click around your app. (In production, the Vite
        plugin strips them out entirely. Zero runtime cost. But in dev and test mode,
        these assertions keep reporting to the collector.)
      </p>
      <p>
        And it means you never again have to apologise
        to your code base for going into application code and writing{' '}
        <code>window.__profileStore = localDb.profileStore</code> to expose items to the headless browser.
      </p>

      <figure className="screenshot">
        <img src="/images/screenshot-4.png" alt="Scenetest dev panel showing inline assertions from React components" />
        <figcaption>The dev panel collects should/failed assertions from your inline assertions in your components, effects, and callbacks whenever they execute.</figcaption>
      </figure>

      <p>
        Because assertions are separate from your script, they may execute many times throughout your run,
		  so the Observer panel includes a <strong>Location View</strong> that shows you how your assertions
		  run in order, repeating as components re-render and effects fire and callback get called back.

        Each row represents a place in your code where an assertion fired; columns group together assertions
		  that fire together (within 50ms).
      </p>

      <figure className="screenshot">
        <img src="/images/location-view.png" alt="Viewing by Location looks at each assertion and summarises all its runs to show you failing and flaky assertions" />
        <figcaption>Viewing by Location looks at each assertion in your app and summarises all its runs to show you failing and flaky tests. Patterns emerge: consistent green means stable code; flickering red helps you spot flaky or timing-dependent assertions that may challenge and hone your understanding of your app throughout the component lifecycle or UX flow.</figcaption>
      </figure>

      <h2>Multi-context comparisons</h2>

      <p>
        We use Playwright in our work and love it, because it allows us to do these multi-context
        assertions. But look at what we have to do to access the profileStore...
        now that we have gone into the App code and done the "assign a bunch of things to the window
        object to help exfiltrate it for the test runner" step mentioned above,
        we are now able to do this kind of "Reverse Server-Action" to get the data back
        out where we can compare it.
      </p>

      <CodeBlock>{`// ❌ "reverse server action" approach
const localDeck = await page.evaluate((lang) => {
  // 🙅❌💀🤧
  const profileStore = window.__profileStore
  return profileStore?.getDeck(lang)
}, TEST_LANG)

const { data: dbDeck } = await getDeck(TEST_LANG, TEST_USER_UID)

expect(dbDeck).toBeTruthy()
expect({
  cards: dbDeck.cards,
  updated_string: dbDeck.updated_string,
}).toMatch({
  cards: localDeck.cards,
  updated_string: localDeck.updated_string,
})`}</CodeBlock>

      <p>
        I love the multi-context assertion capabilities here, but this approach to getting data
        from the client feels like we are breaking into its home in the middle of the night and
        stuffing it in a bag. Let's see if it gets a little nicer when
        we write it using the <em>assert</em> function in the <code>onSettled</code> callback
        after the mutation we're trying to test.
      </p>

      <CodeBlock>{`// ✅ server assertion triggered after a mutation
onSettled: (data) => {
  assert(
    'New deck should initialise the same',
    async (server, clientData) => {
      const newDeck = await server.getDeck(clientData.data.userId, clientData.data.lang)
      if (!newDeck) failed('new deck is not real / persisted')
      should(
        'primary fields should match',
        match(
          [clientData.localDb.cards, newDeck.cards],
          [clientData.localDb.updated_string, newDeck.updated_string]
        )
      )
    },
    () => ({
      data,
      localDb: localDb.profileStore.getDeck(data.lang)
    })
  )
}`}</CodeBlock>

      <p>
        For me, this feels a lot more natural. The engineer who wrote this has waited until the
        exact moment when we decide the data should all be in sync, and then run the assertion
        passing in all the client data it needs. What's so unwieldy about the prior version is that
        we are sending the function from the server to the browser via the headless browser manager,
        but we're not able to get it <em>in</em> to the app context, so we're just pulling from the{' '}
        <code>window</code> object, and we're able to get it to produce data and we can return that
        data across the bridge back to the test server. This clearly works but it is so riddled with
        compromises that it feels like a more natural way is long overdue.
      </p>
      <p>
        And look what it does to the applicability of our test code. This second example will work
        after <em>anyone</em> creates a new deck at any time. Whenever this form or mutation is used,
        the assertion will run. Unlike the reverse-server-action which is orchestrated by the test
        suite and only knows how to compare to <code>getDeck(TEST_LANG, TEST_USER_UID)</code>.
      </p>
      <p>
        And in any other tests that modify decks you'll have to either a) write duplicates of the
        same assertions in new places, or b) create helper functions that DRY this testing logic &ndash;
        additional abstractions, additional things that can pass or fail because you built the abstraction
        imperfectly, opportunities to miss the true nature of whether your app has broken.
      </p>
      <p>
        Scenetest avoids this repetitiveness without the abstraction &ndash; by putting the assertions in with
        the component or hook code in the React app, exactly where it always should have been.
      </p>

      <p>
        <em>
          Scenetest is in early sideproject dev. Please{' '}
          <a href="https://github.com/scenetest/scenetest-js">check it out on GH</a> or{' '}
          <a href="https://bsky.app/profile/msnook.xyz">find me on bsky</a>
          {' '}(<a href="https://twitter.com/mhsnook">or tw</a>) and let me know what you think. &mdash; M
        </em>
      </p>

      <Footer />
    </article>
  )
}
