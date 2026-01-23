import { Component } from 'solid-js'
import { MarkdownSection } from '../components/MarkdownSection'

const FAQ: Component = () => {
  return (
    <article class="page faq">
      <h1>Frequently Asked Questions</h1>

      <MarkdownSection src="/content/faq/vs-playwright.md" />
      <MarkdownSection src="/content/faq/vs-vitest.md" />
      <MarkdownSection src="/content/faq/vs-cypress.md" />
    </article>
  )
}

export default FAQ
