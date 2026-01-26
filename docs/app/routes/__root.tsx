import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Scenetest' },
    ],
    links: [
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
    import('@scenetest/observer').then(({ initObserver }) => {
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
        <Outlet />
        <Scripts />
      </body>
    </html>
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
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow-x: auto;
  margin: 28px 0;
  box-shadow: 2px 2px 2px 2px rgb(0 0 255 / 0.1);
}

pre code {
  background: none;
  padding: 0;
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
`
