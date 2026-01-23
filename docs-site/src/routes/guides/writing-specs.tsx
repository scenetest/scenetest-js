import { Component } from 'solid-js'
import { MarkdownSection } from '../../components/MarkdownSection'
import { Callout } from '../../components/Callout'

const WritingSpecs: Component = () => {
  return (
    <article class="page guide">
      <h1>Writing Specs</h1>
      <p class="lead">
        A guide to writing effective end-to-end tests with Scenetest.
        Learn best practices for inline assertions, working with test IDs,
        and collaborating with engineers.
      </p>

      <div class="llm-copy-section">
        <p>
          Want to feed this guide to an LLM to help write tests?{' '}
          <a href="/content/guides/writing-specs.md" target="_blank">
            View raw markdown
          </a>
        </p>
      </div>

      <MarkdownSection src="/content/guides/writing-specs.md" />
    </article>
  )
}

export default WritingSpecs
