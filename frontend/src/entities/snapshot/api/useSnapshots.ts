import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { SnapshotGroup, SnapshotMeta } from '../model/types'
import { localTzOffsetMinutes, snapshotQueryKeys } from './queryKeys'

interface SnapshotsParams {
  group?: SnapshotGroup
  /** Local day as YYYY-MM-DD; when set, only that day's snapshots are returned. */
  date?: string
}

function fetchSnapshots(
  projectId: string,
  params: SnapshotsParams,
): Promise<SnapshotMeta[]> {
  const query = new URLSearchParams()
  if (params.group) query.set('group', params.group)
  if (params.date) query.set('date', params.date)
  query.set('tz_offset', String(localTzOffsetMinutes()))
  return apiFetch<SnapshotMeta[]>(
    `/projects/${projectId}/snapshots?${query.toString()}`,
  )
}

/** List snapshot metadata (no body), optionally filtered to a group / local day. */
export function useSnapshots(
  projectId: string,
  params: SnapshotsParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: snapshotQueryKeys.list(projectId, params.group, params.date),
    queryFn: () => fetchSnapshots(projectId, params),
    enabled: enabled && projectId.length > 0,
  })
}
