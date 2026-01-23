import { Component } from 'solid-js'

const Home: Component = () => {
  return (
    <article class="page home">
      <h1>Scenetest</h1>
      <p class="lead">
        Evaluate your product, not your tests. Write friendly little Scenes for your Actors.
        A testing framework inspired by Playwright's <code>page.evaluate</code>.
      </p>

      <section>
        <h2>What is Scenetest?</h2>
        <p>
          Scenetest separates two distinct concerns in end-to-end testing:
        </p>
        <ol>
          <li>
            <strong>Scene Specs</strong>: User journeys written with <code>scene()</code> and <code>cast()</code>
          </li>
          <li>
            <strong>Inline Assertions</strong>: Assertions that live inside your components with <code>should()</code> and <code>failed()</code>
          </li>
        </ol>
      </section>

      <section>
        <h2>Scene Spec Example</h2>
        <div class="code-block" data-language="typescript">
          <div class="code-header">
            <span class="code-language">typescript</span>
            <button class="copy-btn" onclick={`navigator.clipboard.writeText(\`import { scene } from '@scenetest/cli'

scene('user can update profile', async ({ cast }) => {
  const user = await cast('user')

  await user.goto('/')
  await user.seeId('profile-form')
  await user.typeInto('name-input', 'New Name')
  await user.clickId('submit-button')
  await user.seeText('Profile updated!')
})\`)`}>Copy</button>
          </div>
          <pre><code class="language-typescript">{`import { scene } from '@scenetest/cli'

scene('user can update profile', async ({ cast }) => {
  const user = await cast('user')

  await user.goto('/')
  await user.seeId('profile-form')
  await user.typeInto('name-input', 'New Name')
  await user.clickId('submit-button')
  await user.seeText('Profile updated!')
})`}</code></pre>
        </div>
      </section>

      <section>
        <h2>Inline Assertion Example</h2>
        <div class="code-block" data-language="tsx">
          <div class="code-header">
            <span class="code-language">tsx</span>
            <button class="copy-btn" onclick={`navigator.clipboard.writeText(\`import { should, failed } from '@scenetest/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)

  if (user?.error) {
    failed('user in unexpected error state', { error: user.error })
  }

  return <form data-testid="profile-form">...</form>
}\`)`}>Copy</button>
          </div>
          <pre><code class="language-tsx">{`import { should, failed } from '@scenetest/react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)

  if (user?.error) {
    failed('user in unexpected error state', { error: user.error })
  }

  return <form data-testid="profile-form">...</form>
}`}</code></pre>
        </div>
      </section>

      <section>
        <h2>Get Started</h2>
        <div class="code-block" data-language="bash">
          <div class="code-header">
            <span class="code-language">bash</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('pnpm add @scenetest/react @scenetest/vite-plugin @scenetest/cli')">Copy</button>
          </div>
          <pre><code class="language-bash">pnpm add @scenetest/react @scenetest/vite-plugin @scenetest/cli</code></pre>
        </div>
        <p>
          Then check out the <a href="/guides/writing-specs">Writing Specs</a> guide to learn
          how to write effective tests with Scenetest.
        </p>
        <p>
          Or try the <a href="/demo">Live Demo</a> to see the observer panel in action.
        </p>
      </section>
    </article>
  )
}

export default Home
