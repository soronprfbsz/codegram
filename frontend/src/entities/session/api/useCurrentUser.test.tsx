import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCurrentUser } from './useCurrentUser'
import * as client from '@/shared/api/client'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

  it('does not retry on a 401', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockRejectedValue(new client.UnauthorizedError())

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeNull())
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
