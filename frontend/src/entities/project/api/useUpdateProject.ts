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
 * Partially update a project (used by manual edits and autosave). On success it
 * merges the fresh project into the detail cache and invalidates the list so a
 * renamed project shows its new name there.
 *
 * The merge PRESERVES role / owner_email: action responses (PATCH) carry those
 * as null (only list/get populate them), so a plain overwrite would clobber the
 * caller's role to null mid-session — flipping the editor to read-only and
 * suspending autosave (ADR-0015). The fresh version always wins.
 */
export function useUpdateProject(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProjectUpdatePayload) => updateProject(id, payload),
    onSuccess: (project) => {
      queryClient.setQueryData<Project | undefined>(
        projectQueryKeys.detail(id),
        (old) =>
          old
            ? {
                ...old,
                ...project,
                role: project.role ?? old.role,
                owner_email: project.owner_email ?? old.owner_email,
              }
            : project,
      )
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() })
    },
  })
}
