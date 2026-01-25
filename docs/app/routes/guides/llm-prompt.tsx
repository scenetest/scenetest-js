import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/llm-prompt')({
  component: LlmPrompt,
})

function LlmPrompt() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/guides/llm-prompt.md" />

      <Footer />
    </article>
  )
}
