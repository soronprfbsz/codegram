import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCurrentUser } from './useCurrentUser'
import * as client from '@/shared/api/client'

function makeWrapper() {
  const queryClient = new QueryClient({
    // retryDelay: 0 so the retry-on-genuine-error test settles immediately
    // instead of waiting out the default exponential backoff (~1s).
    defaultOptions: { queries: { retryDelay: 0 } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the user when the me endpoint resolves', async () => {
    const user = {
      id: 'u-1',
      email: 'a@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: false,
    }
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(user)

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toEqual(user))
    expect(result.current.isError).toBe(false)
  })

  it('returns null (not an error) when the me endpoint responds 401', async () => {
    vi.spyOn(client, 'apiFetch').mockRejectedValueOnce(
      new client.UnauthorizedError(),
    )

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('does not retry a 401 (resolves null in one call, no error)', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockRejectedValue(new client.UnauthorizedError())

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeNull())
    // A 401 is caught in fetchCurrentUser and resolves null, so the queryFn
    // never throws and is invoked exactly once (the retry path is not hit).
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.isError).toBe(false)
  })

  it('retries once on a genuine (non-401) error', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockRejectedValue(new Error('API request failed: 500 Server Error'))

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(),
    })

    // retry: 1 means the queryFn runs the initial attempt + one retry = 2 calls.
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
