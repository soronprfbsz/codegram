import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { SnapshotCalendarDay, SnapshotGroup } from '../model/types'
import { localTzOffsetMinutes, snapshotQueryKeys } from './queryKeys'

function fetchCalendar(
  projectId: string,
  month: string,
  group?: SnapshotGroup,
): Promise<SnapshotCalendarDay[]> {
  const query = new URLSearchParams({ month })
  if (group) query.set('group', group)
  query.set('tz_offset', String(localTzOffsetMinutes()))
  return apiFetch<SnapshotCalendarDay[]>(
    `/projects/${projectId}/snapshots/calendar?${query.toString()}`,
  )
}

/** Local dates with snapshots (and counts) for a local `YYYY-MM` month. */
export function useSnapshotCalendar(
  projectId: string,
  month: string,
  group?: SnapshotGroup,
  enabled = true,
) {
  return useQuery({
    queryKey: snapshotQueryKeys.calendar(projectId, month, group),
    queryFn: () => fetchCalendar(projectId, month, group),
    enabled: enabled && projectId.length > 0,
  })
}
