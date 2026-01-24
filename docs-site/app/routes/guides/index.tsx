import { createFileRoute, Link } from '@tanstack/react-router'

declare const __GIT_COMMIT__: string

export const Route = createFileRoute('/guides/')({
  component: Guides,
})

const guides = [
  {
    slug: 'writing-specs',
    title: 'Writing Specs',
    description: 'Learn the philosophy and best practices for writing scene specs and inline assertions with Scenetest.',
  },
]

function Guides() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Guides</h1>

      <p>
        Learn how to use Scenetest effectively with these guides covering core concepts,
        best practices, and advanced patterns.
      </p>

      <ul className="guides-list">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link to={`/guides/${guide.slug}`}>
              <strong>{guide.title}</strong>
              <span>{guide.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <footer>
        <Link to="/faq">FAQ</Link> &mdash; comparisons with page.evaluate, Vitest, etc.
        <p className="copyright">
          <span className="footer-logo">🎬</span> &copy; m snook 2026 &bull;{' '}
          <a href="https://github.com/scenetest/scenetest-js">github</a> &bull;{' '}
          <a href={`https://github.com/scenetest/scenetest-js/commit/${__GIT_COMMIT__}`}>{__GIT_COMMIT__}</a> &bull;{' '}
          <a href="https://bsky.app/profile/msnook.xyz">contact</a>
        </p>
      </footer>
    </article>
  )
}
