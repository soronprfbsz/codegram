import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { SnapshotFull } from '../model/types'
import { snapshotQueryKeys } from './queryKeys'

export interface CreateSnapshotInput {
  label: string | null
  /**
   * Confirm replacing the manual snapshot that already carries this label
   * (ADR-0023). Without it the API answers 409 with reason 'label_exists'.
   */
  overwrite?: boolean
}

function createSnapshot(
  projectId: string,
  { label, overwrite = false }: CreateSnapshotInput,
): Promise<SnapshotFull> {
  return apiFetch<SnapshotFull>(`/projects/${projectId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify({ label, overwrite }),
  })
}

/** Create a manual snapshot of the project's current state. */
export function useCreateSnapshot(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSnapshotInput) =>
      createSnapshot(projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: snapshotQueryKeys.all }),
  })
}
