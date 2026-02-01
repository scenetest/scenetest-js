import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { LinkCard } from '../../components/LinkCard'

export const Route = createFileRoute('/guides/')({
  component: GuidesIndex,
})

function GuidesIndex() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Guides for Working with Scenes and Checks</h1>

      <p className="subtitle">
        For humans and language models writing scene specs and inline checks.
      </p>

      <h2>How Scenetest Works</h2>

      <p>
        We've split the test into its two main parts: `scenes` and `checks`
      </p>

      <ol>
        <li>
				<p><strong>Scene Orchestration</strong> — scripts that simulate user journeys
          		(login, fill form, click submit). Written in spec files. Not concerned with
			 		implementation details.</p>
			 	<LinkCard
					to="/guides/writing-scene-specs"
					title="Writing Scene Specs"
					description="Learn how to write scene specs that describe user journeys and orchestrate browser interactions."
				/>
				<LinkCard
					to="/guides/building-teams"
					title="Building Teams of Actors"
					description="Design teams that mirror your seed data, scale concurrency, and keep scenes reliable."
				/>
        </li>
        <li>
          	<p><strong>Integrity Checks</strong> — assertion functions like <code>should()</code>
					and <code>failed()</code> and <code>serverCheck()</code>, that can run and should pass every time your component
					or mutation or effect runs. Not concerned with the reason the actor is using the page,
					just runs every time the page gets used (when deployed in test mode).</p>
				<LinkCard
					to="/guides/writing-inline-assertions"
					title="Writing Inline Checks"
					description="Use should(), and failed() on client and with serverCheck() in your application code."
				/>
			</li>
      </ol>

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
		  <LinkCard
          to="/reference/cli"
          title="CLI Reference"
          description="The CLI discovers and runs scene specs, manages browser lifecycle, teams, reports."
        />
      </div>

      <Footer />
    </article>
  )
}
