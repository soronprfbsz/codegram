import { type ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query'
import { UnauthorizedError } from '@/shared/api/client'
import { sessionQueryKey } from '@/entities/session'

/**
 * Build the app QueryClient with a global 401 handler: any query/mutation that
 * fails with UnauthorizedError (e.g. an expired JWT surfacing mid-session on a
 * project load or autosave) marks the session as logged-out by flipping the
 * session query to null. RequireAuth reads that query, so it re-renders and
 * redirects to /login instead of letting the 401 bubble up as a feature-level
 * error. useCurrentUser swallows its OWN 401 into null, so this never fires for
 * the session query itself. Exported as a factory so tests get isolated clients.
 */
export function createQueryClient(): QueryClient {
  const onAuthError = (error: unknown): void => {
    if (error instanceof UnauthorizedError) {
      client.setQueryData(sessionQueryKey, null)
    }
  }
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: onAuthError }),
    mutationCache: new MutationCache({ onError: onAuthError }),
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
