import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { reference } from '../../sections'
import { getMarkdown } from '../../lib/markdown'

// Consolidated pages — redirect old URLs to their new homes
const referenceRedirects: Record<string, string> = {
  'actor-api': '/reference/concurrent-and-classic',
}

export const Route = createFileRoute('/reference/$pageName')({
  loader: ({ params }) => {
    if (referenceRedirects[params.pageName]) {
      throw redirect({ to: referenceRedirects[params.pageName] })
    }
    if (!reference.some((r) => r.slug === params.pageName)) {
      throw notFound()
    }
    const content = getMarkdown(`/reference/${params.pageName}.md`)
    if (content === null) throw notFound()
    return { content }
  },
  component: ReferencePage,
})

function ReferencePage() {
  const { content } = Route.useLoaderData()
  return (
    <article>
      <Link to="/reference" className="back">&larr; Back</Link>

      <MarkdownSection content={content} />

      <Footer />
    </article>
  )
}
