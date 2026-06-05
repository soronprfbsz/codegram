import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import { sessionQueryKey } from '@/entities/session'
import type { User } from '@/entities/session'

export interface RegisterPayload {
  email: string
  password: string
}

/**
 * Register a new user (POST /api/auth/register) — JSON body, 201 + UserRead.
 * Registration does NOT log the user in (no cookie is issued), so the form
 * flow logs in afterwards. We still invalidate the session so any cached
 * null state is refreshed.
 */
export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RegisterPayload) =>
      apiFetch<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
  })
}
