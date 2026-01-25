import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../components/Footer'
import { MarkdownSection } from '../components/MarkdownSection'

export const Route = createFileRoute('/faq')({
  component: FAQ,
})

function FAQ() {
  return (
    <article className="faq">
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Frequently Asked Questions</h1>

      <MarkdownSection src="/faq/vs-playwright.md" />
      <MarkdownSection src="/faq/vs-vitest.md" />
      <MarkdownSection src="/faq/vs-cypress.md" />
      <MarkdownSection src="/faq/security.md" />

      <Footer />
    </article>
  )
}
