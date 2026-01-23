import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { should, failed, assert, useTestEffect } from '@scenetest/react'
import { useProfile, useUpdateProfile, PROFILE_QUERY_KEY } from './hooks'
import { getProfileFromDb, type Profile } from './db'

function ProfileForm() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()

  // Local form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Refs to access DOM values for assertions
  const nameInputRef = useRef<HTMLInputElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const displayNameRef = useRef<HTMLSpanElement>(null)
  const displayEmailRef = useRef<HTMLSpanElement>(null)

  // Sync form state when profile loads
  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
    }
  }, [profile])

  // Basic render assertions
  should('ProfileForm should render', true)

  // Multi-context assertion: verify email is valid on server
  // Runs when profile.email changes, skips when no profile
  useTestEffect(() => {
    if (!profile) return

    assert(
      'Email validation on server',
      (server, data) => {
        const isValid = server.validateEmail(data.email)
        should('profile email should be valid format', isValid, { email: data.email })
      },
      () => ({ email: profile.email })
    )
  }, [profile?.email])

  // Assertion: profile should be loaded before we can edit
  if (!isLoading && profile) {
    should('profile should be loaded from cache', profile.name.length > 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters')
      failed('form submitted with name too short', { name: name.trim() })
      return
    }

    // Submit the update
    updateProfile.mutate(
      { name: name.trim(), email },
      {
        onSuccess: (savedProfile) => {
          should('mutation should complete successfully', true, { savedProfile })

          // ========================================
          // MULTI-CONTEXT ASSERTIONS
          // Compare data across 4 different contexts:
          // 1. DOM (what the user sees)
          // 2. Component state (React's local state)
          // 3. React Query cache (client-side cache)
          // 4. localStorage (the "database")
          //
          // We run assertions twice:
          // 1. After rAF + microtask to catch immediate state
          // 2. After a short delay to verify the settled state
          // ========================================

          const runAssertions = (phase: 'immediate' | 'settled') => {
            // Get data from all contexts
            const domName = displayNameRef.current?.textContent ?? ''
            const domEmail = displayEmailRef.current?.textContent ?? ''
            const stateName = name.trim()
            const stateEmail = email
            const cacheData = queryClient.getQueryData<Profile>(PROFILE_QUERY_KEY)
            const cacheName = cacheData?.name ?? ''
            const cacheEmail = cacheData?.email ?? ''
            const dbProfile = getProfileFromDb()
            const dbName = dbProfile.name
            const dbEmail = dbProfile.email

            // Context for debugging
            const ctx = {
              phase,
              dom: { name: domName, email: domEmail },
              state: { name: stateName, email: stateEmail },
              cache: { name: cacheName, email: cacheEmail },
              db: { name: dbName, email: dbEmail },
            }

            // Assert: DOM matches what was saved
            should('DOM name should match saved value', domName === savedProfile.name, ctx)
            should('DOM email should match saved value', domEmail === savedProfile.email, ctx)

            // Assert: Component state matches saved
            should('state name should match saved value', stateName === savedProfile.name, ctx)
            should('state email should match saved value', stateEmail === savedProfile.email, ctx)

            // Assert: React Query cache is updated
            should('cache name should match saved value', cacheName === savedProfile.name, ctx)
            should('cache email should match saved value', cacheEmail === savedProfile.email, ctx)

            // Assert: localStorage (database) is updated
            should('DB name should match saved value', dbName === savedProfile.name, ctx)
            should('DB email should match saved value', dbEmail === savedProfile.email, ctx)

            // Assert: All contexts are in sync with each other
            const allNamesMatch = domName === stateName && stateName === cacheName && cacheName === dbName
            const allEmailsMatch = domEmail === stateEmail && stateEmail === cacheEmail && cacheEmail === dbEmail

            should('all contexts should have matching name', allNamesMatch, ctx)
            should('all contexts should have matching email', allEmailsMatch, ctx)

            // Assert sync between contexts
            should('DOM should be in sync with database', domName === dbName && domEmail === dbEmail, ctx)
            should('cache should be in sync with database', cacheName === dbName && cacheEmail === dbEmail, ctx)
            should('state should be in sync with database', stateName === dbName && stateEmail === dbEmail, ctx)
          }

          // Run immediately after React flushes (rAF + microtask)
          requestAnimationFrame(() => {
            queueMicrotask(() => runAssertions('immediate'))
          })

          // Run again after settling to confirm final state
          setTimeout(() => runAssertions('settled'), 100)
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Update failed')
          failed('mutation failed with error', { error: err instanceof Error ? err.message : String(err) })
        },
      }
    )
  }

  if (isLoading) {
    return <div data-testid="loading">Loading profile...</div>
  }

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Edit Profile</h1>

      {/* Display current values (for DOM assertions) */}
      <div
        style={{
          marginBottom: '20px',
          padding: '12px',
          background: '#f5f5f5',
          borderRadius: '8px',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>Current Name: </strong>
          <span ref={displayNameRef} data-testid="display-name">
            {profile?.name}
          </span>
        </div>
        <div>
          <strong>Current Email: </strong>
          <span ref={displayEmailRef} data-testid="display-email">
            {profile?.email}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
            Name
          </label>
          <input
            ref={nameInputRef}
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="name-input"
            style={{ width: '100%', padding: '8px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>
            Email
          </label>
          <input
            ref={emailInputRef}
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="email-input"
            style={{ width: '100%', padding: '8px', fontSize: '16px', boxSizing: 'border-box' }}
          />
        </div>

        {error && (
          <div data-testid="error" style={{ color: '#dc2626', marginBottom: '16px', padding: '8px', background: '#fef2f2', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        {updateProfile.isSuccess && (
          <div data-testid="success" style={{ color: '#16a34a', marginBottom: '16px', padding: '8px', background: '#f0fdf4', borderRadius: '4px' }}>
            Profile updated successfully!
          </div>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending}
          data-testid="submit-button"
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: updateProfile.isPending ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: updateProfile.isPending ? 'wait' : 'pointer',
          }}
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Debug panel showing all contexts */}
      <details style={{ marginTop: '24px' }}>
        <summary style={{ cursor: 'pointer', color: '#6b7280' }}>Debug: View All Contexts</summary>
        <pre
          data-testid="debug-contexts"
          style={{
            marginTop: '8px',
            padding: '12px',
            background: '#1f2937',
            color: '#e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(
            {
              componentState: { name, email },
              reactQueryCache: queryClient.getQueryData(PROFILE_QUERY_KEY),
              localStorage: getProfileFromDb(),
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  )
}

export default function App() {
  return <ProfileForm />
}
