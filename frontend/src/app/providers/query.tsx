import { type ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query'
import { ApiError, UnauthorizedError } from '@/shared/api/client'
import { sessionQueryKey } from '@/entities/session'
import { meQueryKey } from '@/entities/account'
import type { AccountMe } from '@/entities/account'

/**
 * Build the app QueryClient with a global 401 handler: any query/mutation that
 * fails with UnauthorizedError (e.g. an expired JWT surfacing mid-session on a
 * project load or autosave) marks the session as logged-out by flipping the
 * session query to null. RequireAuth reads that query, so it re-renders and
 * redirects to /login instead of letting the 401 bubble up as a feature-level
 * error. useCurrentUser swallows its OWN 401 into null, so this never fires for
 * the session query itself.
 *
 * Defense-in-depth for ADR-0016 (server also gates most routes with a 403
 * {reason: "must_change_password"} once a change is forced): patch the
 * cached account/me onto must_change_password=true so RequirePasswordOk
 * re-renders and redirects to /force-password-change, even if the client-side
 * guard was somehow bypassed or is momentarily stale.
 *
 * Exported as a factory so tests get isolated clients.
 */
export function createQueryClient(): QueryClient {
  const onError = (error: unknown): void => {
    if (error instanceof UnauthorizedError) {
      client.setQueryData(sessionQueryKey, null)
    }
    if (error instanceof ApiError && error.status === 403 && error.reason === 'must_change_password') {
      client.setQueryData<AccountMe>(meQueryKey, (old) =>
        old ? { ...old, must_change_password: true } : old,
      )
    }
  }
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}

const queryClient = createQueryClient()

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
