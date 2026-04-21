import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { faqs } from '../../sections'
import { getMarkdown } from '../../lib/markdown'

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
    const content = getMarkdown(`/faq/${params.pageName}.md`)
    if (content === null) throw notFound()
    return { content }
  },
  component: FaqPage,
})

function FaqPage() {
  const { content } = Route.useLoaderData()
  return (
    <article className="faq">
      <Link to="/faq" className="back">&larr; Back</Link>

      <MarkdownSection content={content} />

      <Footer />
    </article>
  )
}
