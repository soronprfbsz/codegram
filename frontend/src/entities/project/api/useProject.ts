import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Project } from '@/entities/project/model/types'
import { projectQueryKeys } from './queryKeys'

/** Fetch a single project from GET /api/projects/{id}. */
function fetchProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`)
}

/** Load one project by id. Disabled while `id` is empty. */
export function useProject(id: string) {
  return useQuery({
    queryKey: projectQueryKeys.detail(id),
    queryFn: () => fetchProject(id),
    enabled: id.length > 0,
  })
}
