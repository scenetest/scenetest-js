import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { guides } from '../../sections'

export const Route = createFileRoute('/guides/$pageName')({
  loader: ({ params }) => {
    if (!guides.some((g) => g.slug === params.pageName)) {
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
