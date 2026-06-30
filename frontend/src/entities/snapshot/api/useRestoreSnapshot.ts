import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import { projectQueryKeys, type Project } from '@/entities/project'
import { snapshotQueryKeys } from './queryKeys'

function restoreSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<Project> {
  return apiFetch<Project>(
    `/projects/${projectId}/snapshots/${snapshotId}/restore`,
    { method: 'POST' },
  )
}

/**
 * Restore the project to a snapshot. Returns the overwritten project. Writes it
 * into the project detail cache and invalidates the snapshot lists (a safety
 * snapshot was created). NOTE: the editor must still imperatively re-seed its
 * local dbml/positions in the caller's onSuccess — the editor's seed effect is
 * keyed on project.id only, so a same-id cache write alone won't re-seed.
 */
export function useRestoreSnapshot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) => restoreSnapshot(projectId, snapshotId),
    onSuccess: (project) => {
      // Merge, preserving role/owner_email (the restore response carries them
      // as null) so the caller's role isn't clobbered → read-only (ADR-0015).
      queryClient.setQueryData<Project | undefined>(
        projectQueryKeys.detail(projectId),
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
      queryClient.invalidateQueries({ queryKey: snapshotQueryKeys.all })
    },
  })
}
