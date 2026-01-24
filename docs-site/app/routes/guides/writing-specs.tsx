import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/writing-specs')({
  component: WritingSpecs,
})

function WritingSpecs() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/content/guides/writing-specs.md" />

      <Footer showCommitHash={false} />
    </article>
  )
}
