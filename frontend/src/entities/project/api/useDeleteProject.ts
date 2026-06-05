import { useMutation, useQueryClient } from '@tanstack/react-query'
import { env } from '@/shared/config/env'
import { ApiError } from '@/shared/api/client'
import { projectQueryKeys } from './queryKeys'

/**
 * DELETE /api/projects/{id}. The backend responds 204 with no body, so we use
 * fetch directly (apiFetch would try to JSON-parse the empty body and throw),
 * mirroring the no-body pattern used by the auth login/logout mutations.
 */
async function deleteProject(id: string): Promise<void> {
  const base = env.apiUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/projects/${id}`, {
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

/** Delete a project, then refresh the project list. */
export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}
