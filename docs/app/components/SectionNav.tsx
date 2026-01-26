import { Link, useLocation } from '@tanstack/react-router'
import { guides, faqs } from '../sections'

export function SectionNav() {
  const { pathname } = useLocation()

  const isGuides = pathname.startsWith('/guides')
  const isFaq = pathname.startsWith('/faq')

  if (!isGuides && !isFaq) return null

  const section = isGuides ? 'guides' : 'faq'
  const items = isGuides ? guides : faqs
  const label = isGuides ? 'Guides' : 'FAQ'

  // Extract the current slug from /section/slug
  const parts = pathname.split('/')
  const currentSlug = parts.length > 2 ? parts[2] : null

  return (
    <nav className="section-nav">
      <Link to={`/${section}`} className="section-nav-heading">
        {label}
      </Link>
      {items.map((item) => (
        <Link
          key={item.slug}
          to={`/${section}/${item.slug}`}
          className={`section-nav-link${item.slug === currentSlug ? ' current' : ''}`}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  )
}
