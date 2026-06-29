import { apiFetch } from '@/shared/api/client'
import { env } from '@/shared/config/env'
import type { LockStatus } from '../model/types'

export const lockQueryKeys = {
  status: (projectId: string) => ['edit-lock', projectId] as const,
}

/** GET current lock status (any participant). */
export function fetchLockStatus(projectId: string): Promise<LockStatus> {
  return apiFetch<LockStatus>(`/projects/${projectId}/edit-lock`)
}

/** Acquire/renew the lock (editor/owner). Rejects 409 when held by another. */
export function acquireLock(projectId: string): Promise<LockStatus> {
  return apiFetch<LockStatus>(`/projects/${projectId}/edit-lock`, {
    method: 'POST',
  })
}

/** Owner force-takeover of a live lock. */
export function forceLock(projectId: string): Promise<LockStatus> {
  return apiFetch<LockStatus>(`/projects/${projectId}/edit-lock/force`, {
    method: 'POST',
  })
}

/** Release the lock if held. Uses keepalive so it survives an unmount/unload. */
export function releaseLock(projectId: string): void {
  const base = env.apiUrl.replace(/\/$/, '')
  void fetch(`${base}/projects/${projectId}/edit-lock`, {
    method: 'DELETE',
    credentials: 'include',
    keepalive: true,
  }).catch(() => {})
}
