import { createFileRoute } from '@tanstack/react-router'
import { Footer } from '../components/Footer'
import { useCheckAssertions } from '../useCheckAssertions'
import { MarkdownSection } from '../components/MarkdownSection'


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
