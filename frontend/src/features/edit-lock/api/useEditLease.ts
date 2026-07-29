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

/** The status of a project nobody is editing — written on a deliberate exit. */
const FREE_LOCK: LockStatus = {
  locked: false,
  locked_by: null,
  locked_by_email: null,
  expires_at: null,
  is_me: false,
}
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
  /**
   * The caller has explicitly entered edit mode and holds the lease (ADR-0025).
   * Opening a project never does this — editing is a mode you step into.
   */
  editMode: boolean
  /** Take the lease and start editing. No-op for viewers / when held by another. */
  enterEditMode: () => void
  /** Hand the lease back and return to reading. */
  exitEditMode: () => void
  /** Entering is possible right now (may edit, and nobody else holds it). */
  canEnterEditMode: boolean
  /** An enter attempt is in flight. */
  entering: boolean
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
 * Drive the single-editor edit lease for a project (ADR-0015): poll status so
 * everyone sees who is editing, renew on a heartbeat while editing, and release
 * on unmount AND on tab close. `canEdit` (owner/editor) gates acquisition;
 * `isOwner` gates force-takeover.
 *
 * Opening a project does NOT take the lease (ADR-0025) — editing is a mode the
 * user enters, so someone who only came to look never blocks the person who
 * came to edit. Handing the lease over is explicit at both ends (ADR-0024):
 * closing the tab gives it back at once, and losing it raises `lostLease`
 * immediately instead of letting the user find out from a rejected save.
 */
export function useEditLease(
  projectId: string,
  { canEdit, isOwner }: { canEdit: boolean; isOwner: boolean },
): EditLease {
  const qc = useQueryClient()
  const [conflict, setConflict] = useState<EditConflictReason | null>(null)
  const [lostLease, setLostLease] = useState(false)
  // Editing is opt-in per visit and never remembered: every entry starts read
  // only, so "opening a project reads it" holds without exception (ADR-0025).
  const [editMode, setEditMode] = useState(false)
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
  // Read-only unless the caller may edit AND has stepped into edit mode AND
  // still holds the lease. Viewers are always read-only.
  const readOnly = !canEdit || !editMode || bumped || lockedByOther

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

  // Leaving the project hands the lease back. Nothing is acquired here — that
  // now takes an explicit enterEditMode() (ADR-0025).
  useEffect(() => {
    if (!projectId || !canEdit) return
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
    // Restored from the back/forward cache: the lease went back on the way out,
    // so the restored page is no longer editing. Drop the mode rather than
    // silently re-taking a lease the user never asked for again (ADR-0025).
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setEditMode(false)
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [projectId, canEdit])

  // Heartbeat: renew while editing, hidden tab included (ADR-0024). Gating this
  // on visibility meant reading another tab for a minute silently expired the
  // lease; abandoned tabs are now reclaimed by the pagehide release above.
  const editModeRef = useRef(editMode)
  editModeRef.current = editMode
  useEffect(() => {
    if (!projectId || !canEdit) return
    const id = setInterval(() => {
      if (!editModeRef.current || !holderRef.current) return
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

  // Losing the lease ends edit mode: staying "in edit mode" while unable to
  // write would be a lie, and the topbar would offer a stop button for
  // something already stopped.
  useEffect(() => {
    if (lostLease) setEditMode(false)
  }, [lostLease])

  // A project switch is not a loss — start the next project reading, as always.
  useEffect(() => {
    heldRef.current = false
    setLostLease(false)
    setEditMode(false)
  }, [projectId])

  const enterEditMode = useCallback(() => {
    acquire.mutate(undefined, {
      onSuccess: () => {
        setEditMode(true)
        setLostLease(false)
      },
      onError: (e) => {
        // Someone took it between the poll and the click — say so instead of
        // dropping the user into a mode that cannot write.
        if (e instanceof ApiError && e.status === 409) setConflict('edit_locked')
      },
    })
  }, [acquire])

  const exitEditMode = useCallback(() => {
    setEditMode(false)
    setLostLease(false)
    // Giving it up on purpose is not losing it: clear the "was holding" mark so
    // the next poll doesn't read the vanishing lease as a takeover.
    heldRef.current = false
    releaseLock(projectId)
    // releaseLock is fire-and-forget (keepalive), so a refetch here would race
    // the DELETE and read back the lease we just gave up. We know the outcome —
    // write it, and let the poll confirm (or correct it if someone else got in).
    writeStatus(FREE_LOCK)
  }, [projectId, writeStatus])

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
    editMode,
    enterEditMode,
    exitEditMode,
    canEnterEditMode: canEdit && !lockedByOther && !editMode,
    entering: acquire.isPending,
    takeover: enterEditMode,
    force: () => {
      forceMut.mutate(undefined, {
        onSuccess: () => {
          // Forcing is how an owner takes over — it puts them in edit mode.
          setEditMode(true)
          setLostLease(false)
        },
      })
    },
    clearBumped,
    reportConflict: (reason?: string) =>
      setConflict(reason === 'stale_version' ? 'stale_version' : 'edit_locked'),
  }
}
