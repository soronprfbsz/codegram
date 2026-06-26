import { useMutation, useQueryClient } from '@tanstack/react-query'
import { env } from '@/shared/config/env'
import { ApiError } from '@/shared/api/client'
import { snapshotQueryKeys } from './queryKeys'

/**
 * DELETE a manual snapshot. The backend responds 204 with no body, so we use
 * fetch directly (apiFetch would try to JSON-parse the empty body), mirroring
 * useDeleteProject.
 */
async function deleteSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<void> {
  const base = env.apiUrl.replace(/\/$/, '')
  const response = await fetch(
    `${base}/projects/${projectId}/snapshots/${snapshotId}`,
    { method: 'DELETE', credentials: 'include' },
  )
  if (!response.ok) {
    throw new ApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
    )
  }
}

/** Delete a manual snapshot, then refresh the snapshot lists. */
export function useDeleteSnapshot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (snapshotId: string) => deleteSnapshot(projectId, snapshotId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: snapshotQueryKeys.all }),
  })
}
