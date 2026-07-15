import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { AccountMe } from '../model/types'
import { meQueryKey } from './queryKeys'

function fetchMe(): Promise<AccountMe> {
  return apiFetch<AccountMe>('/account/me')
}

/** The caller's own identity + resolved RBAC state (role name, permissions). */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
  })
}
