import { Component } from 'solid-js'

const Home: Component = () => {
  return (
    <article class="page home">
      <h1>Scenetest</h1>
      <p class="lead">
        Inline assertions for end-to-end testing. Write assertions inside your components,
        see them in real-time as you develop.
      </p>

      <section>
        <h2>What is Scenetest?</h2>
        <p>
          Scenetest separates two distinct concerns in end-to-end testing:
        </p>
        <ol>
          <li>
            <strong>Scenes</strong>: Testing user journeys and flows through browser orchestration
          </li>
          <li>
            <strong>Inline Assertions</strong>: Assertions that live inside your application code,
            not in separate spec files
          </li>
        </ol>
      </section>

      <section>
        <h2>Quick Example</h2>
        <div class="code-block" data-language="tsx">
          <div class="code-header">
            <span class="code-language">tsx</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText(`import { should } from '@scenetest/react'

function WelcomeMessage({ user }) {
  should('user name is displayed', !!user.name)

  return <h1>Welcome, {user.name}!</h1>
}`)">Copy</button>
          </div>
          <pre><code class="language-tsx">{`import { should } from '@scenetest/react'

function WelcomeMessage({ user }) {
  should('user name is displayed', !!user.name)

  return <h1>Welcome, {user.name}!</h1>
}`}</code></pre>
        </div>
      </section>

      <section>
        <h2>Get Started</h2>
        <div class="code-block" data-language="bash">
          <div class="code-header">
            <span class="code-language">bash</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('npm install @scenetest/core @scenetest/vite-plugin')">Copy</button>
          </div>
          <pre><code class="language-bash">npm install @scenetest/core @scenetest/vite-plugin</code></pre>
        </div>
        <p>
          Then check out the <a href="/guides/writing-specs">Writing Specs</a> guide to learn
          how to write effective tests with Scenetest.
        </p>
      </section>
    </article>
  )
}

export default Home
