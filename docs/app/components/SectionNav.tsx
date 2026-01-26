import { Link, useLocation } from '@tanstack/react-router'
import { guides, reference, faqs } from '../sections'

export function SectionNav() {
  const { pathname } = useLocation()

  const isGuides = pathname.startsWith('/guides')
  const isReference = pathname.startsWith('/reference')
  const isFaq = pathname.startsWith('/faq')

  if (!isGuides && !isReference && !isFaq) return null

  const section = isGuides ? 'guides' : isReference ? 'reference' : 'faq'
  const items = isGuides ? guides : isReference ? reference : faqs
  const label = isGuides ? 'Guides' : isReference ? 'API Ref' : 'FAQ'

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
