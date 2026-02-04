import { createFileRoute, Link } from '@tanstack/react-router'
import { Footer } from '../components/Footer'
import { useCheckAssertions } from '../useCheckAssertions'
import { MarkdownSection } from '../components/MarkdownSection'
import { guides, reference, faqs } from '../sections'


export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  // Enable interactive test assertions for the demo
  useCheckAssertions()

  return (
    <article>
      <div className="hero-logo">🎬</div>

      <MarkdownSection src='/main.md' />

		<h2>Guides</h2>
      <ul>
        {guides.map((g) => (
          <li key={g.slug}><Link to={`/guides/${g.slug}`}>{g.title}</Link></li>
        ))}
      </ul>

      <h2>API Reference</h2>
      <ul>
        {reference.map((r) => (
          <li key={r.slug}><Link to={`/reference/${r.slug}`}>{r.title}</Link></li>
        ))}
      </ul>

      <h2>FAQ</h2>
      <ul>
        {faqs.map((f) => (
          <li key={f.slug}><Link to={`/faq/${f.slug}`}>{f.title}</Link></li>
        ))}
      </ul>


      <p>
        <em>
          Scenetest is in early sideproject dev. Please{' '}
          <a href="https://github.com/scenetest/scenetest-js">check it out on GH</a> or{' '}
          <a href="https://bsky.app/profile/msnook.xyz">find me on bsky</a>
          {' '}(<a href="https://twitter.com/mhsnook">or tw</a>) and let me know what you think. &mdash; M
        </em>
      </p>

      <Footer />
    </article>
  )
}
