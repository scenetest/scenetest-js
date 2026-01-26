import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/building-teams')({
  component: BuildingTeams,
})

function BuildingTeams() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/guides/building-teams.md" />

      <Footer />
    </article>
  )
}
