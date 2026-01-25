import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/writing-inline-assertions')({
  component: WritingInlineAssertions,
})

function WritingInlineAssertions() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/guides/writing-inline-assertions.md" />

      <Footer />
    </article>
  )
}
