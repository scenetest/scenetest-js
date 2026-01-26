import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'

export const Route = createFileRoute('/faq/')({
  component: FAQ,
})

const faqs = [
  {
    slug: 'vs-playwright',
    title: "How is this different from Playwright's page.evaluate()?",
    description:
      "Playwright lets you run code inside the browser from your test file. Scenetest flips this around — assertions live in your app code and fire automatically.",
  },
  {
    slug: 'vs-vitest',
    title: "How is this different from Vitest's in-source testing?",
    description:
      'Vitest in-source tests run in Node with mocked dependencies. Scenetest assertions run inside a real browser with real state, real hooks, and real network calls.',
  },
  {
    slug: 'vs-cypress',
    title: 'How is this different from Cypress component testing?',
    description:
      'Cypress mounts components in isolation. Scenetest runs assertions inside your full application, testing components in context with real data and routing.',
  },
  {
    slug: 'security',
    title: 'Is it safe to run Scenetest in development?',
    description:
      'Yes. Server functions are declared at build time and stripped in production. No runtime code injection is possible.',
  },
]

function FAQ() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Frequently Asked Questions</h1>

      <p>
        Common questions about how Scenetest works and how it compares to
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
