import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { faqs } from '../../sections'

// Consolidated pages — redirect old URLs to their new homes
const faqRedirects: Record<string, string> = {
  'concurrent-vs-classic': '/reference/concurrent-and-classic',
}

export const Route = createFileRoute('/faq/$pageName')({
  loader: ({ params }) => {
    if (faqRedirects[params.pageName]) {
      throw redirect({ to: faqRedirects[params.pageName] })
    }
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
