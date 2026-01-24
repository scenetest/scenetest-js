import { createFileRoute, Link } from '@tanstack/react-router'
import { MarkdownSection } from '../components/MarkdownSection'

export const Route = createFileRoute('/faq')({
  component: FAQ,
})

function FAQ() {
  return (
    <article className="faq">
      <Link to="/" className="back">&larr; Back</Link>
      <h1>Frequently Asked Questions</h1>

      <MarkdownSection src="/content/faq/vs-playwright.md" />
      <MarkdownSection src="/content/faq/vs-vitest.md" />
      <MarkdownSection src="/content/faq/vs-cypress.md" />

      <footer>
        <p className="copyright">
          <span className="footer-logo">🎬</span> &copy; m snook 2026 &bull;{' '}
          <a href="https://github.com/scenetest/scenetest-js">github</a> &bull;{' '}
          <a href="https://bsky.app/profile/msnook.xyz">contact</a>
        </p>
      </footer>
    </article>
  )
}
