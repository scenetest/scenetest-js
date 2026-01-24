import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/writing-scene-specs')({
  component: WritingSceneSpecs,
})

function WritingSceneSpecs() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/content/guides/writing-scene-specs.md" />

      <Footer />
    </article>
  )
}
