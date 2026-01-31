import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { CodeBlock } from '../../components/CodeBlock'
import { TabbedCode } from '../../components/TabbedCode'
import { LinkCard } from '../../components/LinkCard'

export const Route = createFileRoute('/guides/')({
  component: GuidesIndex,
})

function GuidesIndex() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Guides for Writing Scenes and Checks</h1>

      <p className="subtitle">
        For humans and language models writing scenes and inline checks.
      </p>

      <h2>How Scenecheck Works</h2>

      <p>
        We've split the test into its two main parts: `scenes` and `checks`
      </p>

      <ol>
        <li>
          <strong>Scene Orchestration</strong> — scripts that simulate user journeys
          (login, fill form, click submit). Written in spec files. Not concerned with
			 implementation details.
        </li>
        <li>
          <strong>Integrity Checks</strong> — assertion functions like <code>should()</code>
			 and <code>failed()</code> and <code>serverCheck()</code>, that can run and should pass every time your component
			 or mutation or effect runs. Not concerned with the reason the actor is using the page,
			 just runs every time the page gets used (when deployed in test mode).
        </li>
      </ol>

      <p>
        Scenes test <strong>user journeys</strong>. Inline assertions test{' '}
        <strong>the developer's mental model</strong> of how the system works. These are
        different things and benefit from being authored by different people in different places.
      </p>

      <table className="comparison-table">
        <thead>
          <tr>
            <th>Concern</th>
            <th>Where it goes</th>
            <th>Who writes it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>"User can log in and update profile"</td>
            <td>Scene spec file</td>
            <td>QA, PM, or developer</td>
          </tr>
          <tr>
            <td>"Profile data should be loaded before render"</td>
            <td>Inline assertion in component</td>
            <td>Component author</td>
          </tr>
          <tr>
            <td>"Form should not submit with empty name"</td>
            <td>Inline assertion in submit handler</td>
            <td>Feature developer</td>
          </tr>
        </tbody>
      </table>

      <LinkCard
        to="/guides/writing-scene-specs"
        title="Writing Scene Specs"
        description="Learn how to write scene specs that describe user journeys and orchestrate browser interactions."
      />

      <h2>Three Ways to Write Scenes</h2>

      <p>
        All three formats use the same actor DSL methods, selector resolution, configuration,
        and team management. They differ in syntax and execution model.
      </p>

      <TabbedCode
        tabs={[
          {
            label: 'concurrent.spec.ts',
            language: 'typescript',
            code: `import { scene } from '@scenecheck/scenes'

scene('user completes onboarding', ({ actor }) => {
  const user = actor('new-user')
  user.openTo('/')
  user.see('welcome-box')
  user.click('continue-button')
  user.see('onboarding-step')
})`,
          },
          {
            label: 'dsl.spec.md',
            language: 'markdown',
            code: `# user completes onboarding
new-user:
- openTo /
- see welcome-box
- click continue-button
- see onboarding-step`,
          },
          {
            label: 'classic.spec.ts',
            language: 'typescript',
            code: `import { test } from '@scenecheck/scenes'

test('user completes onboarding', async ({ actor }) => {
  const user = await actor('new-user')
  await user.openTo('/')
  await user.see('welcome-box')
  await user.click('continue-button')
  await user.see('onboarding-step')
})`,
          },
        ]}
      />

      <p>
        <strong>Concurrent</strong> is the native model — actor creation is synchronous,
        actions queue up, and all actors drain concurrently when the function returns.{' '}
        <strong>Text DSL</strong> is the most minimal format — plain <code>.spec.md</code> files
        that compile to concurrent scripts. <strong>Classic Driver</strong> is the async/await
        model for those coming from Playwright or Cypress.
      </p>

      <LinkCard
        to="/reference/concurrent-and-classic"
        title="Concurrent and Classic Mode"
        description="Side-by-side comparison: syntax, multi-actor concurrency, coordination, and conditional monitors."
      />

      <h2>Inline Assertions</h2>

      <p>
        Write assertions directly in your components, hooks, and callbacks. They validate
        your mental model of how the system works.
      </p>

      <CodeBlock language="tsx">{`// components/ProfileForm.tsx
import { should, failed } from '@scenecheck/checks-react'

function ProfileForm({ user }) {
  should('user should be available', user !== undefined)
  if (user?.error) failed('unexpected error state', { error: user.error })
  return <form>...</form>
}`}</CodeBlock>

      <LinkCard
        to="/guides/writing-inline-assertions"
        title="Writing Inline Assertions"
        description="Use should(), failed(), and multi-context assert() in your application code."
      />

      <h2>API References</h2>

      <p>
        For complete documentation on actor methods, selectors, and the text DSL format:
      </p>

      <div className="link-card-grid">
        <LinkCard
          to="/reference/actor-api"
          title="Actor API"
          description="Navigation, visibility, interaction, scope, conditionals, and coordination."
        />
        <LinkCard
          to="/reference/selectors"
          title="Selectors"
          description="Attribute matching, nested selectors, key selectors, aliases, and sigils."
        />
        <LinkCard
          to="/reference/text-dsl"
          title="Text DSL Format"
          description="Grammar, .spec.md files, the dsl() method, and macros."
        />
      </div>

      <h2>Configuration &amp; Teams</h2>

      <p>
        Configure Scenecheck in <code>scenecheck.config.ts</code> and define actor teams
        in <code>actors.ts</code> or <code>actors/*.ts</code> files.
      </p>

      <CodeBlock language="typescript">{`// scenecheck.config.ts
import { defineConfig } from '@scenecheck/scenes'

export default defineConfig({
  baseUrl: 'http://localhost:5173',
  scenes: './scenes',
  browser: 'chromium',
  timeout: 30000,
  aliases: {
    modal: '[role=dialog]',
    nav: '[role=navigation]',
  },
})`}</CodeBlock>

      <LinkCard
        to="/guides/building-teams"
        title="Building Teams of Actors"
        description="Design teams that mirror your seed data, scale concurrency, and keep scenes reliable."
      />

      <Footer />
    </article>
  )
}
