import { Link } from '@tanstack/react-router'

declare const __GIT_COMMIT__: string

export function Footer() {
  return (
    <footer>
      <Link to="/">Home</Link>
      <br />
		<Link to="/faq">FAQ</Link> &mdash; comparisons with page.evaluate, Vitest, etc.
      <br />
      <Link to="/guides">Guides</Link> &ndash; writing good specs, casting, assertions
		<br />
      <Link to="/reference">References</Link> &ndash; API refs, CLI, DSL, selectors, run-modes
      <p className="copyright">
        <span className="footer-logo">🎬</span> &copy; m snook 2026 &bull;{' '}
        <a href="https://github.com/scenetest/scenetest-js">github</a> &bull;{' '}
        <a href={`https://github.com/scenetest/scenetest-js/commit/${__GIT_COMMIT__}`}>{__GIT_COMMIT__}</a> &bull;{' '}
        <a href="https://bsky.app/profile/msnook.xyz">contact</a>
      </p>
    </footer>
  )
}
