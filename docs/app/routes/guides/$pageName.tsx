import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

const guidePages = [
  'llm-prompt',
  'writing-inline-assertions',
  'building-teams',
  'writing-scene-specs',
]

export const Route = createFileRoute('/guides/$pageName')({
  loader: ({ params }) => {
    if (!guidePages.includes(params.pageName)) {
      throw notFound()
    }
  },
  component: GuidePage,
})

function GuidePage() {
  const { pageName } = Route.useParams()
  return (
    <article>
      <Link to="/guides" className="back">&larr; Back</Link>

      <MarkdownSection src={`/guides/${pageName}.md`} />

      <Footer />
    </article>
  )
}
