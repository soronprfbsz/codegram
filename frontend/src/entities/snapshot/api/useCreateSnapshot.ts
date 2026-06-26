import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { SnapshotFull } from '../model/types'
import { snapshotQueryKeys } from './queryKeys'

function createSnapshot(
  projectId: string,
  label: string | null,
): Promise<SnapshotFull> {
  return apiFetch<SnapshotFull>(`/projects/${projectId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  })
}

/** Create a manual snapshot of the project's current state. */
export function useCreateSnapshot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string | null) => createSnapshot(projectId, label),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: snapshotQueryKeys.all }),
  })
}
