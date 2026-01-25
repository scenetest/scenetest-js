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

      <MarkdownSection src="/content/faq/security.md" />
      <MarkdownSection src="/content/faq/vs-playwright.md" />
      <MarkdownSection src="/content/faq/vs-vitest.md" />
      <MarkdownSection src="/content/faq/vs-cypress.md" />

      <Footer />
    </article>
  )
}
