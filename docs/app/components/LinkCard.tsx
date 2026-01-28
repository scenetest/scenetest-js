import { Link } from '@tanstack/react-router'

interface LinkCardProps {
  to: string
  title: string
  description: string
}

export function LinkCard({ to, title, description }: LinkCardProps) {
  return (
    <Link to={to} className="link-card">
      <strong>{title}</strong>
      <span>{description}</span>
      <span className="link-card-arrow">&rarr;</span>
    </Link>
  )
}
