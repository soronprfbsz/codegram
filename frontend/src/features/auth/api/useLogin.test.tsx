import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLogin } from './useLogin'
import { sessionQueryKey, useCurrentUser } from '@/entities/session'
import { meQueryKey } from '@/entities/account'

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

    // No waitFor: mutateAsync has already resolved above, so invalidation must
    // have happened by now. (If onSuccess did not return the promise, this
    // would still pass — the dedicated regression test below proves the await.)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sessionQueryKey,
    })
  })

  it('removes the previous user\'s cached identity so a stale me cannot mask the new session', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { queryClient, wrapper } = makeHarness()
    // Simulate a prior user's cached /account/me (must_change_password=false).
    queryClient.setQueryData(meQueryKey, {
      id: 'prev',
      email: 'prev@example.com',
      role_name: 'admin',
      permissions: ['user:read', 'user:manage'],
      must_change_password: false,
    })

    const { result } = renderHook(() => useLogin(), { wrapper })
    await result.current.mutateAsync({
      email: 'new@example.com',
      password: 'password123',
    })

    // The stale identity is gone → the guarded route refetches /account/me fresh.
    expect(queryClient.getQueryData(meQueryKey)).toBeUndefined()
  })

  it('awaits the session refetch before mutateAsync resolves', async () => {
    // invalidateQueries only refetches ACTIVE queries, so we mount
    // useCurrentUser alongside useLogin — the production scenario where a
    // guard/page observes ['session']. The first /me resolves immediately
    // (401 → session null); the post-login refetch is held open so we can
    // prove mutateAsync does not resolve until that refetch settles.
    let releaseMe: ((value: Response) => void) | undefined
    let meCallCount = 0
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/auth/jwt/login')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      // GET /users/me
      meCallCount += 1
      if (meCallCount === 1) {
        // Initial mount: logged out.
        return Promise.resolve(new Response(null, { status: 401 }))
      }
      // Post-login refetch: held open until released below.
      return new Promise<Response>((resolve) => {
        releaseMe = resolve
      })
    })

    const { wrapper } = makeHarness()

    const { result } = renderHook(
      () => ({ login: useLogin(), session: useCurrentUser() }),
      { wrapper },
    )

    // Initial session resolves to null (401 handled in fetchCurrentUser).
    await waitFor(() => expect(result.current.session.data).toBeNull())

    let resolved = false
    const mutation = result.current.login
      .mutateAsync({ email: 'a@example.com', password: 'password123' })
      .then(() => {
        resolved = true
      })

    // Wait until the invalidate-triggered second GET /users/me has fired
    // (proving onSuccess kicked off the refetch). It is still held open.
    await waitFor(() => expect(meCallCount).toBeGreaterThanOrEqual(2))

    // The mutation must NOT have resolved yet: it is awaiting the refetch.
    // (Without `return` in onSuccess, mutateAsync resolves here and this fails.)
    expect(resolved).toBe(false)

    // Release the /me response; only now may the mutation resolve.
    releaseMe?.(
      new Response(
        JSON.stringify({
          id: 'u-1',
          email: 'a@example.com',
          is_active: true,
          is_superuser: false,
          is_verified: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await mutation
    expect(resolved).toBe(true)
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
