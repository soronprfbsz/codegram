import type { SnapshotGroup } from '../model/types'

/**
 * Centralized TanStack Query keys for the snapshot entity.
 * Mutations invalidate the whole `all` namespace for simplicity (a create /
 * delete / restore can affect both the list and the calendar).
 */
export const snapshotQueryKeys = {
  all: ['snapshots'] as const,
  list: (projectId: string, group?: SnapshotGroup, date?: string) =>
    [
      ...snapshotQueryKeys.all,
      'list',
      projectId,
      group ?? null,
      date ?? null,
    ] as const,
  calendar: (projectId: string, month: string, group?: SnapshotGroup) =>
    [...snapshotQueryKeys.all, 'calendar', projectId, month, group ?? null] as const,
  detail: (snapshotId: string) =>
    [...snapshotQueryKeys.all, 'detail', snapshotId] as const,
}

/** Minutes to ADD to UTC to get the browser's local time (KST -> 540). */
export function localTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}
