import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Role } from '../model/types'
import { rolesQueryKey } from './queryKeys'

function fetchRoles(): Promise<Role[]> {
  return apiFetch<Role[]>('/roles')
}

/** List every role with the permission codes it currently grants (requires user:read). */
export function useRoles() {
  return useQuery({
    queryKey: rolesQueryKey,
    queryFn: fetchRoles,
  })
}
