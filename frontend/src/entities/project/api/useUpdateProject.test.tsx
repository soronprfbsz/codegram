import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUpdateProject } from './useUpdateProject'
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

describe('useUpdateProject', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes /projects/{id} and writes the result into the detail cache', async () => {
    const updated = {
      id: 'p-1',
      user_id: 'u-1',
      name: 'Same',
      dbml_text: 'table t {}',
      layout: {},
      created_at: '2026-06-05T00:00:00Z',
      updated_at: '2026-06-05T00:01:00Z',
    }
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(updated)
    const { queryClient, wrapper } = makeHarness()

    const { result } = renderHook(() => useUpdateProject('p-1'), { wrapper })

    await result.current.mutateAsync({ dbml_text: 'table t {}' })

    expect(spy).toHaveBeenCalledWith('/projects/p-1', {
      method: 'PATCH',
      body: JSON.stringify({ dbml_text: 'table t {}' }),
    })
    expect(queryClient.getQueryData(projectQueryKeys.detail('p-1'))).toEqual(
      updated,
    )
  })
})
