import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { reference } from '../../sections'

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
