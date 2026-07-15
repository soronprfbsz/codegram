import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Account } from '../model/types'
import { accountQueryKeys } from './queryKeys'

function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/accounts')
}

/** List every account with its resolved role name (requires user:read). */
export function useAccounts() {
  return useQuery({
    queryKey: accountQueryKeys.list(),
    queryFn: fetchAccounts,
  })
}
