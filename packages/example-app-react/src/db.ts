/**
 * Simple localStorage "database" for the profile.
 * This simulates a real database that we'd want to compare against
 * in our multi-context assertions.
 */

export interface Profile {
  name: string
  email: string
  updatedAt: number
}

const STORAGE_KEY = 'scenecheck-profile'

// Default profile for demo
const DEFAULT_PROFILE: Profile = {
  name: 'Test User',
  email: 'test@example.com',
  updatedAt: Date.now(),
}

/**
 * Read profile from localStorage (the "database")
 */
export function getProfileFromDb(): Profile {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore parse errors
  }
  // Initialize with default if not exists
  saveProfileToDb(DEFAULT_PROFILE)
  return DEFAULT_PROFILE
}

/**
 * Write profile to localStorage (the "database")
 */
export function saveProfileToDb(profile: Profile): Profile {
  const updated = { ...profile, updatedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

/**
 * Reset to default profile (useful for tests)
 */
export function resetProfileDb(): void {
  localStorage.removeItem(STORAGE_KEY)
}
