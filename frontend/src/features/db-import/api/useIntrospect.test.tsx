import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useIntrospect } from './useIntrospect'
import * as client from '@/shared/api/client'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useIntrospect', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs /introspect with the request body', async () => {
    const response = {
      import_dialect: 'postgres',
      ddl: 'CREATE TABLE t (id INT);',
      table_count: 1,
    }
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValueOnce(response)
    const { result } = renderHook(() => useIntrospect(), { wrapper })

    const req = {
      dialect: 'postgresql' as const,
      host: 'db',
      port: 5432,
      username: 'u',
      password: 'p',
      database: 'app',
      db_schema: 'public',
      ssl: false,
    }
    const returned = await result.current.mutateAsync(req)

    expect(returned).toEqual(response)
    expect(spy).toHaveBeenCalledWith('/introspect', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  })
})
