import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Member } from '../model/types'
import { memberQueryKeys } from './queryKeys'

/** GET /api/projects/{id}/members — the owner + members roster. */
export function useMembers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: memberQueryKeys.list(projectId),
    queryFn: () => apiFetch<Member[]>(`/projects/${projectId}/members`),
    enabled,
  })
}
