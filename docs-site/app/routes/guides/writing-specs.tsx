import { createFileRoute, Link } from '@tanstack/react-router'
import { MarkdownSection } from '../../components/MarkdownSection'

export const Route = createFileRoute('/guides/writing-specs')({
  component: WritingSpecs,
})

function WritingSpecs() {
  return (
    <article>
      <Link to="/" className="back">&larr; Back</Link>

      <MarkdownSection src="/content/guides/writing-specs.md" />

      <footer>
        <Link to="/faq">FAQ</Link> &mdash; comparisons with page.evaluate, Vitest, etc.
        <p className="copyright">
          <span className="footer-logo">🎬</span> &copy; m snook 2026 &bull;{' '}
          <a href="https://github.com/scenetest/scenetest-js">github</a> &bull;{' '}
          <a href="https://bsky.app/profile/msnook.xyz">contact</a>
        </p>
      </footer>
    </article>
  )
}
