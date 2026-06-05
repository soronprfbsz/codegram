import { useQuery } from '@tanstack/react-query'
import { apiFetch, UnauthorizedError } from '@/shared/api/client'
import type { User } from '@/entities/session/model/types'

/** Shared query key for the current-user session. */
export const sessionQueryKey = ['session'] as const

/**
 * Fetch the current user from GET /api/users/me.
 * A 401 means "logged out": resolve to null rather than throwing.
 */
async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await apiFetch<User>('/users/me')
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return null
    }
    throw error
  }
}

/**
 * Track the current authenticated user. Returns null when logged out.
 * Never retries on a 401 (it is a normal logged-out state, not a failure).
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof UnauthorizedError) {
        return false
      }
      return failureCount < 3
    },
  })
}
