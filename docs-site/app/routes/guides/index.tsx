import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'

export const Route = createFileRoute('/guides/')({
  component: Guides,
})

const guides = [
  {
    slug: 'writing-scene-specs',
    title: 'Writing Scene Specs',
    description: 'Learn how to write scene specs that describe user journeys and orchestrate browser interactions.',
  },
  {
    slug: 'writing-inline-assertions',
    title: 'Writing Inline Assertions',
    description: 'Use should(), failed(), and assert() to verify component state from inside your application code.',
  },
  {
    slug: 'llm-prompt',
    title: 'Using AI to Write Specs',
    description: 'A copyable prompt for using LLMs to convert natural language test descriptions into scene specs.',
  },
]

function Guides() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Guides</h1>

      <p>
        Learn how to use Scenetest effectively with these guides covering core concepts,
        best practices, and advanced patterns.
      </p>

      <ul className="guides-list">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link to={`/guides/${guide.slug}`}>
              <strong>{guide.title}</strong>
              <span>{guide.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Footer />
    </article>
  )
}
