import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { faqs } from '../../sections'

export const Route = createFileRoute('/faq/$pageName')({
  loader: ({ params }) => {
    if (!faqs.some((f) => f.slug === params.pageName)) {
      throw notFound()
    }
  },
  component: FaqPage,
})

function FaqPage() {
  const { pageName } = Route.useParams()
  return (
    <article className="faq">
      <Link to="/faq" className="back">&larr; Back</Link>

      <MarkdownSection src={`/faq/${pageName}.md`} />

      <Footer />
    </article>
  )
}
