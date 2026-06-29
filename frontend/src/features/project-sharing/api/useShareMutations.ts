import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '@/shared/api/client'
import { env } from '@/shared/config/env'
import { projectQueryKeys } from '@/entities/project'
import type { Member, MemberRole } from '../model/types'
import { memberQueryKeys } from './queryKeys'

/** DELETE helper (204, no body) mirroring useDeleteProject. */
async function del(path: string): Promise<void> {
  const base = env.apiUrl.replace(/\/$/, '')
  const response = await fetch(`${base}${path}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    throw new ApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
    )
  }
}

/** Invite an existing user by email with a role (owner only). */
export function useInviteMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { email: string; role: MemberRole }) =>
      apiFetch<Member>(`/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: memberQueryKeys.list(projectId) }),
  })
}

/** Change a member's role (owner only). */
export function useUpdateMemberRole(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; role: MemberRole }) =>
      apiFetch<Member>(`/projects/${projectId}/members/${vars.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: vars.role }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: memberQueryKeys.list(projectId) }),
  })
}

/** Remove a member (owner only). */
export function useRemoveMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      del(`/projects/${projectId}/members/${userId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: memberQueryKeys.list(projectId) }),
  })
}

/** Leave a project the caller is a member of (editor/viewer). */
export function useLeaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      del(`/projects/${projectId}/members/me`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}
