import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type {
  Project,
  ProjectCreatePayload,
} from '@/entities/project/model/types'
import { projectQueryKeys } from './queryKeys'

/** POST /api/projects to create a project. */
function createProject(payload: ProjectCreatePayload): Promise<Project> {
  return apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Create a project, then refresh the project list. */
export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProject,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}
