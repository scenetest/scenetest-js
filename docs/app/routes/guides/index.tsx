import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { guides } from '../../sections'

export const Route = createFileRoute('/guides/')({
  component: Guides,
})

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
