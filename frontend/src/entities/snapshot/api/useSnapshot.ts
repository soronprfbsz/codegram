import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { SnapshotFull } from '../model/types'
import { snapshotQueryKeys } from './queryKeys'

function fetchSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<SnapshotFull> {
  return apiFetch<SnapshotFull>(
    `/projects/${projectId}/snapshots/${snapshotId}`,
  )
}

/** Fetch one snapshot WITH its body (dbml_text + layout) for preview/restore. */
export function useSnapshot(
  projectId: string,
  snapshotId: string | null,
) {
  return useQuery({
    queryKey: snapshotQueryKeys.detail(snapshotId ?? ''),
    queryFn: () => fetchSnapshot(projectId, snapshotId as string),
    enabled: projectId.length > 0 && !!snapshotId,
  })
}
