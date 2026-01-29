import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { faqs } from '../../sections'

export const Route = createFileRoute('/faq/')({
  component: FAQ,
})

function FAQ() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Frequently Asked Questions</h1>

      <p>
        Common questions about how Scenecheck works and how it compares to
        other testing tools.
      </p>

      <ul className="guides-list">
        {faqs.map((faq) => (
          <li key={faq.slug}>
            <Link to={`/faq/${faq.slug}`}>
              <strong>{faq.title}</strong>
              <span>{faq.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Footer />
    </article>
  )
}
