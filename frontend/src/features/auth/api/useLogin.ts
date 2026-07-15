import { useMutation, useQueryClient } from '@tanstack/react-query'
import { env } from '@/shared/config/env'
import { sessionQueryKey } from '@/entities/session'
import { meQueryKey } from '@/entities/account'

export interface LoginPayload {
  email: string
  password: string
}

/**
 * Log in via the fastapi-users OAuth2 form endpoint (POST /api/auth/jwt/login).
 * The backend names the email field "username" and responds 204 with a
 * Set-Cookie header (httpOnly JWT). On success, invalidate the session so
 * useCurrentUser refetches the now-authenticated user.
 *
 * onSuccess RETURNS the invalidation promise so mutateAsync does not resolve
 * until the ['session'] refetch settles — otherwise a caller that navigates on
 * resolve would land on a guarded route while the session cache is still null.
 *
 * Uses fetch directly (not apiFetch) because the body is form-encoded and
 * the 204 response has no JSON body to parse.
 */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const base = env.apiUrl.replace(/\/$/, '')
      const body = new URLSearchParams()
      body.set('username', payload.email)
      body.set('password', payload.password)

      const response = await fetch(`${base}/auth/jwt/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }
    },
    onSuccess: () => {
      // Drop the PREVIOUS user's cached identity so the new session never reads
      // a stale ['account','me'] — e.g. an earlier user's
      // must_change_password=false masking this user's forced change (the app's
      // 5-min staleTime otherwise serves the stale value and the guard lets them
      // straight into the app). Session is invalidated (awaited) so the guarded
      // route sees the authenticated user before we navigate.
      queryClient.removeQueries({ queryKey: meQueryKey })
      return queryClient.invalidateQueries({ queryKey: sessionQueryKey })
    },
  })
}
