import { Link } from '@tanstack/react-router'

declare const __GIT_COMMIT__: string

interface FooterProps {
  showFaqLink?: boolean
  showCommitHash?: boolean
}

export function Footer({ showFaqLink = true, showCommitHash = true }: FooterProps) {
  return (
    <footer>
      {showFaqLink && (
        <>
          <Link to="/faq">FAQ</Link> &mdash; comparisons with page.evaluate, Vitest, etc.
        </>
      )}
      <p className="copyright">
        <span className="footer-logo">🎬</span> &copy; m snook 2026 &bull;{' '}
        <a href="https://github.com/scenetest/scenetest-js">github</a> &bull;{' '}
        {showCommitHash && (
          <>
            <a href={`https://github.com/scenetest/scenetest-js/commit/${__GIT_COMMIT__}`}>{__GIT_COMMIT__}</a> &bull;{' '}
          </>
        )}
        <a href="https://bsky.app/profile/msnook.xyz">contact</a>
      </p>
    </footer>
  )
}
