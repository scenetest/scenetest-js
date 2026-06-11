import { useEffect, useRef } from 'react'
import { should, useCheck } from '@scenetest/checks/react'

/**
 * Hook that adds interactive test assertions to the docs page.
 * Demonstrates scenetest inline assertions on hover, click, and page load.
 */
export function useCheckAssertions() {
  const interactionCountRef = useRef(0)
  const codeBlockRenderCountsRef = useRef(new WeakMap<Element, number>())
  const clickTimesRef = useRef<number[]>([])

  // Initial page load assertions
  useCheck(() => {
    const timer = setTimeout(() => {
      should('Document should be fully loaded', document.readyState === 'complete')
      should('DOM should be ready for interaction', document.body !== null)
      // Flaky demo - occasionally fails
      should('Async initialization should complete without race conditions', Math.random() > 0.15)
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const TRIPLE_CLICK_THRESHOLD = 500

    // Triple-click detection - users shouldn't click so much!
    function handleGlobalClick() {
      const now = Date.now()
      // Keep only recent clicks
      clickTimesRef.current = clickTimesRef.current.filter(t => now - t < TRIPLE_CLICK_THRESHOLD)
      clickTimesRef.current.push(now)

      if (clickTimesRef.current.length >= 3) {
        should(
          'User should not click so much!!!',
          false,
          `${clickTimesRef.current.length} clicks in ${now - clickTimesRef.current[0]}ms`
        )
        // Reset after triggering so it can trigger again
        clickTimesRef.current = []
      }
    }

    // Code blocks - demonstrate assertions about rendered content
    function handleCodeBlockEnter(el: HTMLElement) {
      const counts = codeBlockRenderCountsRef.current
      const count = (counts.get(el) || 0) + 1
      counts.set(el, count)

      should('Code block should be visible', el.offsetHeight > 0)
      should(
        'Code block should have text content every time it renders',
        (el.textContent?.length || 0) > 0,
        `render #${count}`
      )
      // Flaky assertion demo - fails ~25% of the time
      should('Syntax highlighting should not throw errors', Math.random() > 0.25)
    }

    // Section headers (h2)
    function handleH2Enter(el: HTMLElement) {
      const text = el.textContent?.trim() || ''
      should('Section header should have text content', text.length > 0)
      should('Header element should be in the document', document.contains(el))
    }

    // Main title (h1)
    function handleH1Enter(el: HTMLElement) {
      should('Page title should be rendered', el.textContent?.includes('Scenetest') || el.textContent?.includes('scenetest'))
    }

    function handleH1Click() {
      should('Click handler should not throw', true)
      should('Document should remain interactive after click', document.body !== null)
    }

    // Subtitle
    function handleSubtitleEnter(el: HTMLElement) {
      should('Subtitle should be visible', el.offsetHeight > 0)
    }

    // External links
    function handleExternalLinkEnter(el: HTMLAnchorElement) {
      should('Link href should be valid URL', el.href.startsWith('http'))
      should('Link should have accessible text', (el.textContent?.trim().length || 0) > 0)
    }

    function handleExternalLinkClick() {
      should('Navigation should not be blocked', true)
    }

    // Screenshot/figure elements
    function handleFigureEnter(el: HTMLElement) {
      const img = el.querySelector('img')
      should('Figure should contain an image', img !== null)
      if (img) {
        should('Image should have alt text', !!(img.alt && img.alt.length > 0))
        should('Image should have loaded', img.complete)
      }
    }

    function handleFigureClick() {
      // Flaky assertion demo
      should('Image interaction should not cause errors', Math.random() > 0.2)
    }

    // Content paragraphs
    function handleParagraphEnter(el: HTMLElement) {
      interactionCountRef.current++
      const count = interactionCountRef.current

      should('Paragraph should have readable content', (el.textContent?.length || 0) > 20)

      if (count === 5) {
        should('Multiple elements should be interactive', count >= 5)
      }
      if (count === 10) {
        should('State should remain consistent across interactions', true)
      }
    }

    // Footer
    function handleFooterEnter() {
      should('Footer should be at end of document', true)
      should('Page layout should be complete', document.readyState === 'complete')
    }

    // Section dividers
    function handleDividerEnter() {
      should('Visual separator should render correctly', true)
    }

    // Panel meta-assertions
    function handlePanelEnter(el: HTMLElement) {
      should('Assertion panel should be interactive', true)
      should('Panel state should be consistent', el.querySelector('#scenetest-list') !== null)
    }

    // Set up event listeners
    document.addEventListener('click', handleGlobalClick)

    // Code blocks
    document.querySelectorAll<HTMLElement>('pre code').forEach(el => {
      el.addEventListener('mouseenter', () => handleCodeBlockEnter(el))
    })

    // Section headers
    document.querySelectorAll<HTMLElement>('h2').forEach(el => {
      el.addEventListener('mouseenter', () => handleH2Enter(el))
    })

    // Main title
    document.querySelectorAll<HTMLElement>('h1').forEach(el => {
      el.addEventListener('mouseenter', () => handleH1Enter(el))
      el.addEventListener('click', handleH1Click)
    })

    // Subtitle
    document.querySelectorAll<HTMLElement>('.subtitle').forEach(el => {
      el.addEventListener('mouseenter', () => handleSubtitleEnter(el))
    })

    // External links
    document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach(el => {
      el.addEventListener('mouseenter', () => handleExternalLinkEnter(el))
      el.addEventListener('click', handleExternalLinkClick)
    })

    // Screenshots
    document.querySelectorAll<HTMLElement>('figure.screenshot').forEach(el => {
      el.addEventListener('mouseenter', () => handleFigureEnter(el))
      el.addEventListener('click', handleFigureClick)
    })

    // Content paragraphs
    document.querySelectorAll<HTMLElement>('article > p').forEach(el => {
      el.addEventListener('mouseenter', () => handleParagraphEnter(el))
    })

    // Footer
    document.querySelectorAll<HTMLElement>('footer').forEach(el => {
      el.addEventListener('mouseenter', handleFooterEnter)
    })

    // Dividers
    document.querySelectorAll<HTMLElement>('.divider').forEach(el => {
      el.addEventListener('mouseenter', handleDividerEnter)
    })

    // Panel (with delay since it's dynamically created)
    const panelTimeout = setTimeout(() => {
      const panel = document.getElementById('scenetest-panel')
      if (panel) {
        panel.addEventListener('mouseenter', () => handlePanelEnter(panel))
      }
    }, 100)

    // Cleanup
    return () => {
      document.removeEventListener('click', handleGlobalClick)
      clearTimeout(panelTimeout)
      // Note: Individual element listeners get cleaned up when elements unmount
    }
  }, [])
}
