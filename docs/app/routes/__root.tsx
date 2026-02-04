import {
  Outlet,
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { SectionNav } from '../components/SectionNav'
import { LinkCard } from '../components/LinkCard'
import { Footer } from '../components/Footer'
import { guides, reference, faqs } from '../sections'

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Scenetest JS | Local first testing for Vite apps' },
    ],
    links: [
      { rel: 'icon', type: 'image/png', href: '/images/favicon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  useEffect(() => {
    // Initialize observer panel for demo
    import('@scenetest/checks-panel').then(({ initObserver }) => {
      initObserver()
    })
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{cssStyles}</style>
      </head>
      <body>
        <SectionNav />
        <Outlet />
        <nav className="side-nav">
          <Link to="/">Home</Link>
          <Link to="/guides">Guides</Link>
          <Link to="/reference">API Ref</Link>
          <Link to="/faq">FAQ</Link>
          <a href="https://github.com/scenetest/scenetest-js">GitHub</a>
        </nav>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <article className="not-found">
      <div className="not-found-hero">
        <span className="hero-logo" style={{ fontSize: '5rem', width: '120px', height: '120px', borderRadius: '24px' }}>🎬</span>
        <h1>404 - That's not a page!</h1>
        <p>
          We're sorry &mdash; this site is under active development and things move around.
          Try one of the pages below, or head <Link to="/">back home</Link>.
        </p>
      </div>

      <h2>Guides</h2>
      <div className="link-card-grid">
        {guides.map((g) => (
          <LinkCard key={g.slug} to={`/guides/${g.slug}`} title={g.title} description={g.description} />
        ))}
      </div>

      <h2>API Reference</h2>
      <div className="link-card-grid">
        {reference.map((r) => (
          <LinkCard key={r.slug} to={`/reference/${r.slug}`} title={r.title} description={r.description} />
        ))}
      </div>

      <h2>FAQ</h2>
      <div className="link-card-grid">
        {faqs.map((f) => (
          <LinkCard key={f.slug} to={`/faq/${f.slug}`} title={f.title} description={f.description} />
        ))}
      </div>

      <Footer />
    </article>
  )
}

const cssStyles = `
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #faf9f7;
  --text: #1a1a1a;
  --text-light: #555;
  --accent: #5046e5;
  --code-bg: #f0eeeb;
  --border: #e0ddd8;
}

body {
  font-family: 'Source Serif 4', Georgia, serif;
  background: var(--bg);
  color: var(--text);
  font-size: 19px;
  line-height: 1.7;
}

article {
  max-width: 680px;
  margin: 0 auto;
  padding: 80px 24px 120px;
  margin-right: max(auto, 200px);
}

/* Side nav */
.side-nav {
  position: fixed;
  right: calc(15vw - 60px);
  top: 120px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
}

.side-nav a {
  color: var(--text-light);
  text-decoration: none;
  transition: color 0.15s;
}

.side-nav a:hover,
.side-nav a.active {
  color: var(--accent);
}

@media (max-width: 960px) {
  .side-nav {
    display: none;
  }

  article {
    margin-right: auto;
  }
}

.hero-logo {
  font-size: 4rem;
  text-align: center;
  margin-bottom: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 20px;
  background: rgba(80, 70, 229, 0.12);
  box-shadow: inset 0 2px 8px rgba(80, 70, 229, 0.25),
              inset 0 -1px 2px rgba(255, 255, 255, 0.5);
}

h1 {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 2.5rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.subtitle {
  font-style: italic;
  color: var(--text-light);
  margin-bottom: 48px;
  font-size: 1.1rem;
}

h2, h3, h4 {
  scroll-margin-top: 24px;
}

h2 {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 1.25rem;
  font-weight: 500;
  margin-top: 56px;
  margin-bottom: 20px;
  letter-spacing: -0.01em;
}

p {
  margin-bottom: 24px;
}

a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

strong {
  font-weight: 700;
}

em {
  font-style: italic;
}

code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.88em;
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
}

pre {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow-x: auto;
  margin: 28px 0;
  box-shadow: 2px 2px 2px 2px rgb(0 0 255 / 0.1);
}

pre code {
	display: block;
	overflow: auto;
  background: none;
  padding: 1em;
}

blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 24px;
  margin: 32px 0;
  font-style: italic;
  color: var(--text-light);
}

.divider {
  text-align: center;
  margin: 48px 0;
  color: var(--text-light);
  letter-spacing: 0.3em;
}

ul, ol {
  margin-bottom: 24px;
  margin-left: 28px;
}

ol {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 1rem;
}

li {
  margin-bottom: 8px;
}

footer {
  margin-top: 60px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  font-size: 0.95rem;
  color: var(--text-light);
}

footer a {
  color: var(--text-light);
  text-decoration: none;
  text-decoration: underline;
}

footer a.active {
	opacity: 70%;
	cursor: default;
}

.footer-logo {
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(80, 70, 229, 0.12);
  box-shadow: inset 0 1px 4px rgba(80, 70, 229, 0.25),
              inset 0 -0.5px 1px rgba(255, 255, 255, 0.5);
  margin-right: 6px;
  vertical-align: middle;
}

.back {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.9rem;
  margin-bottom: 40px;
  display: block;
}

.copyright {
  margin-top: 16px;
  font-size: 0.85rem;
  color: #888;
}

.copyright a {
  color: inherit;
  text-decoration: none;
  transition: color 0.15s;
}

.copyright a:hover {
  color: var(--text);
}

figure.screenshot {
  margin: 40px -40px;
  text-align: center;
  background: white;
  border-radius: 8px;
  padding-bottom: 10px;
  border: 1px solid var(--border);
}

figure.screenshot img {
  max-width: 100%;
  border-radius: 8px;
  border-bottom: 1px solid var(--border);
}

figure.screenshot figcaption {
  margin-top: 6px;
  padding: 0 4% 6px;
  font-size: 0.85rem;
  color: var(--text-light);
  font-style: italic;
}

@media (max-width: 720px) {
  figure.screenshot {
    margin-left: -12px;
    margin-right: -12px;
  }
}

.faq h1 {
  font-size: 2rem;
  margin-bottom: 48px;
}

.faq h2 {
  font-size: 1.15rem;
}

.faq h2:first-of-type {
  margin-top: 0;
}

/* Code block with copy button */
.code-block {
  position: relative;
  margin: 28px 0;
}

.code-block pre {
  margin: 0;
}

.code-block .copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.code-block:hover .copy-btn {
  opacity: 1;
}

.code-block .copy-btn:hover {
  background: white;
}

/* Page-level copy markdown button */
.markdown-section {
  position: relative;
}

.copy-md-btn {
  position: absolute;
  top: -36px;
  right: 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--text-light);
}

.markdown-section:hover .copy-md-btn {
  opacity: 1;
}

.copy-md-btn:hover {
  background: white;
  color: var(--text);
}

/* ── Tabbed code blocks ── */
.tabbed-code {
  margin: 28px 0;
}

.tabbed-code-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding-left: 4px;
}

.tabbed-code-tab {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.78rem;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  color: var(--text-light);
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}

.tabbed-code-tab:hover {
  color: var(--text);
}

.tabbed-code-tab.active {
  color: var(--text);
  background: var(--code-bg);
  border-color: var(--border);
}

.tabbed-code-panel {
  display: none;
}

.tabbed-code-panel.active {
  display: block;
}

.tabbed-code-panel .code-block {
  margin: 0;
}

.tabbed-code-panel .code-block pre {
  margin: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: none;
}

/* Link cards */
.link-card {
  display: block;
  padding: 20px 24px;
  margin: 24px 0;
  background: white;
  border: 2px solid var(--border);
  border-radius: 8px;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  position: relative;
}

.link-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(80, 70, 229, 0.15);
  transform: translateY(-2px);
}

.link-card strong {
  display: block;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.link-card span {
  display: block;
  font-size: 0.92rem;
  color: var(--text-light);
  line-height: 1.5;
}

.link-card-arrow {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.2rem;
  color: var(--accent);
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
}

.link-card:hover .link-card-arrow {
  opacity: 1;
  transform: translateY(-50%) translateX(4px);
}

.link-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.link-card-grid .link-card {
  margin: 0;
}

/* Comparison table */
.comparison-table {
  width: 100%;
  margin: 24px 0;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.comparison-table th,
.comparison-table td {
  padding: 12px 16px;
  border: 1px solid var(--border);
  text-align: left;
}

.comparison-table th {
  background: var(--code-bg);
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 500;
  font-size: 0.85rem;
}

.comparison-table td {
  background: white;
}

/* Guides list */
.guides-list {
  list-style: none;
  margin: 32px 0;
  padding: 0;
}

.guides-list li {
  margin-bottom: 16px;
}

.guides-list a {
  display: block;
  padding: 20px 24px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 8px;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.guides-list a:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 8px rgba(80, 70, 229, 0.1);
}

.guides-list strong {
  display: block;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 6px;
}

.guides-list span {
  display: block;
  font-size: 0.95rem;
  color: var(--text-light);
  line-height: 1.5;
}

/* Section nav (left sidebar) */
.section-nav {
  position: fixed;
  left: 32px;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.8rem;
  max-width: 180px;
  view-transition-name: section-nav;
}

.section-nav-heading {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--text);
  text-decoration: none;
  margin-bottom: 4px;
}

.section-nav-heading:hover {
  color: var(--accent);
}

.section-nav-link {
  color: var(--text-light);
  text-decoration: none;
  line-height: 1.4;
  transition: color 0.15s;
}

.section-nav-link:hover {
  color: var(--accent);
}

.section-nav-link.current {
  color: var(--text);
  font-weight: 500;
}

@media (max-width: 1200px) {
  .section-nav {
    display: none;
  }
}

/* ── View Transitions ── */

article {
  view-transition-name: page-content;
}

article > h1 {
  view-transition-name: page-title;
}

.markdown-section h1:first-child {
  view-transition-name: page-title;
}

.side-nav {
  view-transition-name: side-nav;
}

footer {
  view-transition-name: page-footer;
}

.back {
  view-transition-name: back-nav;
}

/* Side nav + section nav: no transition at all — perfectly still */
::view-transition-old(side-nav),
::view-transition-new(side-nav),
::view-transition-old(section-nav),
::view-transition-new(section-nav) {
  animation: none;
}

/* Root cross-fade: brief, barely there */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 180ms;
  animation-timing-function: ease-out;
}

/* Page content: gentle rise */
::view-transition-old(page-content) {
  animation: vt-recede 220ms ease-in both;
}

::view-transition-new(page-content) {
  animation: vt-arrive 280ms ease-out both;
}

/* Title: smooth settle, slightly longer to anchor the eye */
::view-transition-group(page-title) {
  animation-duration: 300ms;
  animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
}

::view-transition-old(page-title),
::view-transition-new(page-title) {
  animation-duration: 250ms;
  animation-timing-function: ease-out;
}

/* Footer: quiet fade */
::view-transition-old(page-footer),
::view-transition-new(page-footer) {
  animation-duration: 200ms;
  animation-timing-function: ease-out;
}

/* Back link: understated */
::view-transition-old(back-nav),
::view-transition-new(back-nav) {
  animation-duration: 150ms;
  animation-timing-function: ease-out;
}

@keyframes vt-recede {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(6px);
  }
}

@keyframes vt-arrive {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 404 page */
.not-found {
  max-width: 720px;
  margin: 0 auto;
  padding: 80px 24px 120px;
}

.not-found-hero {
  text-align: center;
  margin-bottom: 48px;
}

.not-found-hero p {
  color: var(--text-light);
  font-size: 1.05rem;
  max-width: 480px;
  margin: 0 auto;
}

.not-found h2 {
  margin-top: 40px;
  margin-bottom: 16px;
}
`
