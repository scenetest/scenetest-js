import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'

const faqPages = [
  'vs-playwright',
  'vs-vitest',
  'vs-cypress',
  'security',
]

export const Route = createFileRoute('/faq/$pageName')({
  loader: ({ params }) => {
    if (!faqPages.includes(params.pageName)) {
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
