import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useProjectList } from './useProjectList'
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

describe('useProjectList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('GETs /projects and returns the list', async () => {
    const projects = [
      {
        id: 'p-1',
        user_id: 'u-1',
        name: 'Project 1',
        dbml_text: '',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
    ]
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(projects)

    const { result } = renderHook(() => useProjectList(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(projects)
    expect(spy).toHaveBeenCalledWith('/projects')
  })
})
