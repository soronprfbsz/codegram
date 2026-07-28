import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/api/client'
import { projectQueryKeys } from '@/entities/project'
import {
  acquireLock,
  fetchLockStatus,
  forceLock,
  lockQueryKeys,
  releaseLock,
} from './editLock'
import type { EditConflictReason, LockStatus } from '../model/types'

const HEARTBEAT_MS = 20_000
const POLL_MS = 15_000

export interface EditLease {
  status: LockStatus | undefined
  /** Read-only for the caller — true unless they currently hold the live lock. */
  readOnly: boolean
  isHolder: boolean
  lockedByOther: boolean
  holderEmail: string | null
  /** Owner may force-take a live lock held by someone else. */
  canForce: boolean
  /** A content write was rejected 409 — the conflict dialog is open. */
  bumped: boolean
  /** Which kind of 409 it was, so the dialog can say the right thing. */
  conflictReason: EditConflictReason | null
  takeover: () => void
  force: () => void
  clearBumped: () => void
  /** Called by autosave on a 409 — the caller's write was rejected. */
  reportConflict: (reason?: string) => void
}

/**
 * Drive the single-editor edit lease for a project (ADR-0015): acquire on
 * mount, renew on a visibility-gated heartbeat, release on unmount, and poll
 * status so read-only users see who is editing. `canEdit` (owner/editor) gates
 * acquisition; `isOwner` gates force-takeover.
 */
export function useEditLease(
  projectId: string,
  { canEdit, isOwner }: { canEdit: boolean; isOwner: boolean },
): EditLease {
  const qc = useQueryClient()
  const [conflict, setConflict] = useState<EditConflictReason | null>(null)
  const bumped = conflict !== null

  const statusQuery = useQuery({
    queryKey: lockQueryKeys.status(projectId),
    queryFn: () => fetchLockStatus(projectId),
    enabled: Boolean(projectId),
    refetchInterval: POLL_MS,
  })
  const status = statusQuery.data
  const isHolder = Boolean(status?.locked && status.is_me)
  const lockedByOther = Boolean(status?.locked && !status.is_me)
  // Optimistic: an editor is read-only only when ANOTHER user holds the live
  // lock or they were just bumped — not merely "hasn't acquired yet" (avoids a
  // load flash). A first save auto-acquires server-side; the backstop rejects a
  // genuinely concurrent write with 409 (→ bumped). Viewers are always read-only.
  const readOnly = canEdit ? bumped || lockedByOther : true

  const writeStatus = useCallback(
    (s: LockStatus) => qc.setQueryData(lockQueryKeys.status(projectId), s),
    [qc, projectId],
  )

  const acquire = useMutation({
    mutationFn: () => acquireLock(projectId),
    onSuccess: (s) => {
      writeStatus(s)
      setConflict(null)
    },
  })
  const forceMut = useMutation({
    mutationFn: () => forceLock(projectId),
    onSuccess: (s) => {
      writeStatus(s)
      setConflict(null)
    },
  })

  // Refs so the heartbeat reads the latest holder/acquire without re-arming.
  const holderRef = useRef(isHolder)
  useEffect(() => {
    holderRef.current = isHolder
  }, [isHolder])
  const acquireRef = useRef(acquire)
  useEffect(() => {
    acquireRef.current = acquire
  }, [acquire])

  // Acquire on mount / project switch; release on leave. Editors/owners only.
  useEffect(() => {
    if (!projectId || !canEdit) return
    acquireRef.current.mutate() // a 409 just leaves the caller read-only
    return () => releaseLock(projectId)
  }, [projectId, canEdit])

  // Visibility-gated heartbeat: renew only while holding and the tab is visible.
  useEffect(() => {
    if (!projectId || !canEdit) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !holderRef.current) return
      acquireRef.current.mutate(undefined, {
        onError: (e) => {
          // An acquire only ever 409s because someone else holds the lease.
          if (e instanceof ApiError && e.status === 409) setConflict('edit_locked')
        },
      })
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [projectId, canEdit])

  const clearBumped = useCallback(() => {
    setConflict(null)
    qc.invalidateQueries({ queryKey: projectQueryKeys.detail(projectId) })
    void statusQuery.refetch()
  }, [qc, projectId, statusQuery])

  return {
    status,
    readOnly,
    isHolder,
    lockedByOther,
    holderEmail: status?.locked_by_email ?? null,
    canForce: isOwner && lockedByOther,
    bumped,
    conflictReason: conflict,
    takeover: () => acquire.mutate(),
    force: () => forceMut.mutate(),
    clearBumped,
    reportConflict: (reason?: string) =>
      setConflict(reason === 'stale_version' ? 'stale_version' : 'edit_locked'),
  }
}
