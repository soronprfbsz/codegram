import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLogin } from './useLogin'
import { sessionQueryKey } from '@/entities/session'

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useLogin', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts form-encoded credentials with include and invalidates the session', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { queryClient, wrapper } = makeHarness()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useLogin(), { wrapper })

    await result.current.mutateAsync({
      email: 'a@example.com',
      password: 'password123',
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeInstanceOf(URLSearchParams)
    expect((init.body as URLSearchParams).get('username')).toBe(
      'a@example.com',
    )
    expect((init.body as URLSearchParams).get('password')).toBe(
      'password123',
    )

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: sessionQueryKey,
      }),
    )
  })

  it('rejects when the backend returns 400 bad credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'LOGIN_BAD_CREDENTIALS' }), {
        status: 400,
      }),
    )
    const { wrapper } = makeHarness()

    const { result } = renderHook(() => useLogin(), { wrapper })

    await expect(
      result.current.mutateAsync({
        email: 'a@example.com',
        password: 'wrong',
      }),
    ).rejects.toThrow(/login failed/i)
  })
})
