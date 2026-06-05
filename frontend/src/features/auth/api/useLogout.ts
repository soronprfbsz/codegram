import { useMutation, useQueryClient } from '@tanstack/react-query'
import { env } from '@/shared/config/env'
import { sessionQueryKey } from '@/entities/session'

/**
 * Log out (POST /api/auth/jwt/logout). The backend clears the httpOnly cookie
 * and responds 204 (no JSON body), so we use fetch directly. On success,
 * set the session query data to null so guards redirect to /login.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const base = env.apiUrl.replace(/\/$/, '')
      const response = await fetch(`${base}/auth/jwt/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Logout failed')
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, null)
    },
  })
}
