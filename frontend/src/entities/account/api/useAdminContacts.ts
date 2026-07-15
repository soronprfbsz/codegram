import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { AdminContact } from '../model/types'
import { adminContactsQueryKey } from './queryKeys'

function fetchAdminContacts(): Promise<AdminContact[]> {
  return apiFetch<AdminContact[]>('/admins')
}

/**
 * List every admin's email (GET /admins). Public/unauthenticated: used on the
 * login screen's "비밀번호 초기화" guidance, before a session exists.
 */
export function useAdminContacts() {
  return useQuery({
    queryKey: adminContactsQueryKey,
    queryFn: fetchAdminContacts,
  })
}
