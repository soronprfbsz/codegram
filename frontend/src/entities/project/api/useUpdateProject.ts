import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type {
  Project,
  ProjectUpdatePayload,
} from '@/entities/project/model/types'
import { projectQueryKeys } from './queryKeys'

/** PATCH /api/projects/{id} with a partial body. */
function updateProject(
  id: string,
  payload: ProjectUpdatePayload,
): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Partially update a project (used by manual edits and autosave). On success
 * it writes the fresh project into the detail cache and invalidates the list
 * so a renamed project shows its new name there.
 */
export function useUpdateProject(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectUpdatePayload) => updateProject(id, payload),
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKeys.detail(id), project)
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() })
    },
  })
}
