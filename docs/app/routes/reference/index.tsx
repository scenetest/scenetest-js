import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { reference } from '../../sections'

export const Route = createFileRoute('/reference/')({
  component: Reference,
})

function Reference() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>API Reference</h1>

      <p>
        Complete reference for Scenetest's scene orchestration and actor APIs.
      </p>

      <ul className="guides-list">
        {reference.map((item) => (
          <li key={item.slug}>
            <Link to={`/reference/${item.slug}`}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Footer />
    </article>
  )
}
