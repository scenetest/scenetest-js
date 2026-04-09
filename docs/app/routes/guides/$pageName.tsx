import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { Footer } from '../../components/Footer'
import { MarkdownSection } from '../../components/MarkdownSection'
import { guides } from '../../sections'

// Consolidated pages — redirect old URLs to their new homes
const guideRedirects: Record<string, string> = {
  'understanding-concurrent-driver': '/reference/concurrent-and-classic',
}

export const Route = createFileRoute('/guides/$pageName')({
  loader: ({ params }) => {
    if (guideRedirects[params.pageName]) {
      throw redirect({ to: guideRedirects[params.pageName] })
    }
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
