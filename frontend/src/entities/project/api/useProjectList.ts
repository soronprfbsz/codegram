import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Project } from '@/entities/project/model/types'
import { projectQueryKeys } from './queryKeys'

/** Fetch the caller's projects from GET /api/projects. */
function fetchProjectList(): Promise<Project[]> {
  return apiFetch<Project[]>('/projects')
}

/** List the authenticated user's projects. */
export function useProjectList() {
  return useQuery({
    queryKey: projectQueryKeys.list(),
    queryFn: fetchProjectList,
  })
}
