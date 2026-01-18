import { useState, useEffect } from 'react'
import { pass, fail } from 'scenetest'

/**
 * Simulates fetching a user profile (like useProfile hook)
 */
function useProfile() {
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate async fetch
    const timer = setTimeout(() => {
      setProfile({ name: 'Test User', email: 'test@example.com' })
      setIsLoading(false)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return { profile, isLoading }
}

function ProfileForm() {
  const { profile, isLoading } = useProfile()
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline Assertions - these run every render and report to the test runner
  pass('ProfileForm rendered successfully', true)
  fail('ProfileForm should not have error on initial render', error !== null && !submitted)

  // Once loaded, sync the name field
  useEffect(() => {
    if (profile) {
      setName(profile.name)
    }
  }, [profile])

  // Assertion after profile loads
  if (!isLoading && profile) {
    pass('Profile loaded with name', profile.name.length > 0)
    pass('Profile loaded with email', profile.email.includes('@'))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)

    // Validate
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters')
      fail('Form validation failed', true)
      return
    }

    setError(null)
    pass('Form submitted successfully', true)
  }

  if (isLoading) {
    return <div data-testid="loading">Loading profile...</div>
  }

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Edit Profile</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '4px' }}>
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="name-input"
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '4px' }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={profile?.email ?? ''}
            disabled
            data-testid="email-input"
            style={{ width: '100%', padding: '8px', background: '#eee' }}
          />
        </div>

        {error && (
          <div data-testid="error" style={{ color: 'red', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {submitted && !error && (
          <div data-testid="success" style={{ color: 'green', marginBottom: '16px' }}>
            Profile updated successfully!
          </div>
        )}

        <button type="submit" data-testid="submit-button" style={{ padding: '8px 16px' }}>
          Save Changes
        </button>
      </form>
    </div>
  )
}

export default function App() {
  return <ProfileForm />
}
