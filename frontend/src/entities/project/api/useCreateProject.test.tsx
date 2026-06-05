import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateProject } from './useCreateProject'
import { projectQueryKeys } from './queryKeys'
import * as client from '@/shared/api/client'

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

describe('useCreateProject', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs /projects and invalidates the list on success', async () => {
    const created = {
      id: 'p-1',
      user_id: 'u-1',
      name: 'New',
      dbml_text: '',
      layout: {},
      created_at: '2026-06-05T00:00:00Z',
      updated_at: '2026-06-05T00:00:00Z',
    }
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(created)
    const { queryClient, wrapper } = makeHarness()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateProject(), { wrapper })

    const returned = await result.current.mutateAsync({ name: 'New' })

    expect(returned).toEqual(created)
    expect(spy).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'New' }),
    })
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: projectQueryKeys.list(),
      }),
    )
  })
})
