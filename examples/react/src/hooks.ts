/**
 * React Query hooks for profile management.
 *
 * These hooks provide access to the profile data through React Query's cache,
 * which is one of the contexts we'll compare in our multi-context assertions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfileFromDb, saveProfileToDb, type Profile } from './db'

export const PROFILE_QUERY_KEY = ['profile'] as const

/**
 * Query hook to fetch profile from localStorage "database"
 */
export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => {
      // Simulate small network delay
      return new Promise<Profile>((resolve) => {
        setTimeout(() => {
          resolve(getProfileFromDb())
        }, 100)
      })
    },
    staleTime: Infinity, // Don't refetch automatically
  })
}

/**
 * Mutation hook to update profile in localStorage "database"
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Simulate a server-side rejection for a reserved name. This is a
      // deliberate error path — a scene can assert it with expectConsoleError.
      if (updates.name?.toLowerCase() === 'taken') {
        throw new Error('the name "taken" is already in use (409)')
      }

      const current = getProfileFromDb()
      const updated = saveProfileToDb({ ...current, ...updates })
      return updated
    },
    onSuccess: (newProfile) => {
      // Update the cache with the new profile
      queryClient.setQueryData(PROFILE_QUERY_KEY, newProfile)
    },
  })
}

/**
 * Direct access to cached profile data (for assertions)
 */
export function useProfileFromCache() {
  const queryClient = useQueryClient()
  return queryClient.getQueryData<Profile>(PROFILE_QUERY_KEY)
}
