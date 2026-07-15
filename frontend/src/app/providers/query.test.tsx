import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { createQueryClient } from './query'
import { UnauthorizedError, ApiError } from '@/shared/api/client'
import { sessionQueryKey } from '@/entities/session'
import { meQueryKey } from '@/entities/account'

describe('createQueryClient global 401 handler', () => {
  it('flips the session to null when a QUERY fails with UnauthorizedError', async () => {
    const client = createQueryClient()
    client.setQueryData(sessionQueryKey, { id: 'u1', email: 'a@b.c' }) // "logged in"
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useQuery({
          queryKey: ['boom'],
          queryFn: async () => {
            throw new UnauthorizedError()
          },
          retry: false,
        }),
      { wrapper },
    )
    await waitFor(() => expect(client.getQueryData(sessionQueryKey)).toBeNull())
  })

  it('flips the session to null when a MUTATION fails with UnauthorizedError', async () => {
    const client = createQueryClient()
    client.setQueryData(sessionQueryKey, { id: 'u1', email: 'a@b.c' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new UnauthorizedError()
          },
        }),
      { wrapper },
    )
    result.current.mutate()
    await waitFor(() => expect(client.getQueryData(sessionQueryKey)).toBeNull())
  })

  it('leaves the session untouched for a NON-401 error', async () => {
    const client = createQueryClient()
    const user = { id: 'u1', email: 'a@b.c' }
    client.setQueryData(sessionQueryKey, user)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useQuery({
          queryKey: ['boom500'],
          queryFn: async () => {
            throw new ApiError('server error', 500)
          },
          retry: false,
        }),
      { wrapper },
    )
    // Wait for the query to settle in error, then session must be unchanged.
    await waitFor(() => {
      const state = client.getQueryState(['boom500'])
      expect(state?.status).toBe('error')
    })
    expect(client.getQueryData(sessionQueryKey)).toEqual(user)
  })
})

describe('createQueryClient global 403 must_change_password handler', () => {
  const me = {
    id: 'u-1',
    email: 'a@b.c',
    role_name: 'user',
    permissions: [],
    must_change_password: false,
  }

  it('flips account/me must_change_password to true on a 403 must_change_password error', async () => {
    const client = createQueryClient()
    client.setQueryData(meQueryKey, me)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useQuery({
          queryKey: ['boom403'],
          queryFn: async () => {
            throw new ApiError('forbidden', 403, 'must_change_password')
          },
          retry: false,
        }),
      { wrapper },
    )
    await waitFor(() =>
      expect(client.getQueryData(meQueryKey)).toMatchObject({
        must_change_password: true,
      }),
    )
  })

  it('leaves account/me untouched for a 403 WITHOUT the must_change_password reason', async () => {
    const client = createQueryClient()
    client.setQueryData(meQueryKey, me)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useQuery({
          queryKey: ['boom403-other'],
          queryFn: async () => {
            throw new ApiError('forbidden', 403)
          },
          retry: false,
        }),
      { wrapper },
    )
    await waitFor(() => {
      const state = client.getQueryState(['boom403-other'])
      expect(state?.status).toBe('error')
    })
    expect(client.getQueryData(meQueryKey)).toEqual(me)
  })
})
