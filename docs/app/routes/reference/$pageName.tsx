import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { reference } from '../../sections'

export const Route = createFileRoute('/reference/$pageName')({
  loader: ({ params }) => {
    if (!reference.some((r) => r.slug === params.pageName)) {
      throw notFound()
    }
  },
  component: ReferencePage,
})

function ReferencePage() {
  const { pageName } = Route.useParams()
  return (
    <article>
      <Link to="/reference" className="back">&larr; Back</Link>

      <MarkdownSection src={`/reference/${pageName}.md`} />

      <Footer />
    </article>
  )
}
