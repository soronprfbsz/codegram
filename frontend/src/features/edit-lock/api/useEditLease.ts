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
  /**
   * The caller held the lease and no longer does. Surfaced the moment the
   * status poll notices, so they hear it from the topbar instead of from a
   * rejected save (ADR-0024). Cleared once they hold it again.
   */
  lostLease: boolean
  takeover: () => void
  force: () => void
  clearBumped: () => void
  /** Called by autosave on a 409 — the caller's write was rejected. */
  reportConflict: (reason?: string) => void
}

/**
 * Drive the single-editor edit lease for a project (ADR-0015): acquire on
 * mount, renew on a heartbeat, release on unmount AND on tab close, and poll
 * status so read-only users see who is editing. `canEdit` (owner/editor) gates
 * acquisition; `isOwner` gates force-takeover.
 *
 * Handing the lease over is explicit at both ends (ADR-0024): closing the tab
 * gives it back at once, and losing it raises `lostLease` immediately instead
 * of letting the user find out from a rejected save.
 */
export function useEditLease(
  projectId: string,
  { canEdit, isOwner }: { canEdit: boolean; isOwner: boolean },
): EditLease {
  const qc = useQueryClient()
  const [conflict, setConflict] = useState<EditConflictReason | null>(null)
  const [lostLease, setLostLease] = useState(false)
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

  // Closing the tab/browser hands the lease back immediately (ADR-0024).
  // Unmount alone never fires on a close, so without this the next editor waits
  // out the full TTL. releaseLock uses keepalive, so the DELETE still goes out.
  // NOT wired to visibilitychange: switching tabs is part of an edit session.
  useEffect(() => {
    if (!projectId || !canEdit) return
    // Unconditional on purpose: gating this on locally-known holder state
    // leaks the lease when the tab closes before the first status lands, which
    // is the very hole this exists to close. The server only deletes the row
    // when the caller holds it, so a release from a non-holder is a no-op.
    const onPageHide = () => releaseLock(projectId)
    // Restored from the back/forward cache: the lease was released on the way
    // out, so take it again rather than editing without one.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) acquireRef.current.mutate()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [projectId, canEdit])

  // Heartbeat: renew while holding, hidden tab included (ADR-0024). Gating this
  // on visibility meant reading another tab for a minute silently expired the
  // lease; abandoned tabs are now reclaimed by the pagehide release above.
  useEffect(() => {
    if (!projectId || !canEdit) return
    const id = setInterval(() => {
      if (!holderRef.current) return
      acquireRef.current.mutate(undefined, {
        onError: (e) => {
          // An acquire only ever 409s because someone else holds the lease.
          if (e instanceof ApiError && e.status === 409) setConflict('edit_locked')
        },
      })
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [projectId, canEdit])

  // Losing the lease is announced, not discovered by a failing save (ADR-0024):
  // the moment the polled status stops naming us, raise a flag the topbar turns
  // into "you lost it / resume editing".
  const heldRef = useRef(false)
  useEffect(() => {
    if (isHolder) {
      heldRef.current = true
      setLostLease(false)
      return
    }
    if (heldRef.current && canEdit) setLostLease(true)
    heldRef.current = false
  }, [isHolder, canEdit])

  // A project switch is not a loss — start the next project with a clean slate.
  useEffect(() => {
    heldRef.current = false
    setLostLease(false)
  }, [projectId])

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
    lostLease,
    takeover: () => acquire.mutate(),
    force: () => forceMut.mutate(),
    clearBumped,
    reportConflict: (reason?: string) =>
      setConflict(reason === 'stale_version' ? 'stale_version' : 'edit_locked'),
  }
}
