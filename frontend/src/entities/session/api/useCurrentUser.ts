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
 * A 401 is handled inside fetchCurrentUser (resolves null), so the queryFn
 * never throws it — only genuine errors reach retry, where one retry suffices.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
