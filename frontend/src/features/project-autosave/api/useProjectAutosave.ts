import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { useUpdateProject } from '@/entities/project'
import { ApiError } from '@/shared/api/client'
import type { StoredLayout } from '@/entities/layout'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseProjectAutosaveOptions {
  projectId: string
  dbmlText: string
  layout?: StoredLayout
  /**
   * The last server-seeded value. Autosave never fires while dbmlText still
   * equals the baseline, so opening a project (the seed) and re-seeding on a
   * project switch don't trigger a PATCH — only genuine user edits do.
   */
  baseline?: string
  /**
   * The last server-seeded layout. A layout-only change (dragging a table;
   * dbmlText unchanged) saves only when the serialized layout diverges from
   * this baseline, so the layout seed and a project re-seed never PATCH.
   */
  layoutBaseline?: StoredLayout
  delayMs?: number
  /**
   * While true (e.g. a snapshot preview is open, or the caller is read-only /
   * doesn't hold the edit lock), autosave is paused: no PATCH fires and any
   * already-debounced save is cancelled.
   */
  suspended?: boolean
  /**
   * The project version the local content is based on — sent with each content
   * PATCH for the optimistic-concurrency backstop (ADR-0015). The server bumps
   * it; the editor feeds the fresh value back in via the project detail cache.
   */
  version?: number
  /**
   * Called when a save is rejected 409 — the editor surfaces the conflict
   * dialog. Receives the server's `reason` ("edit_locked" when someone else
   * took the lease, "stale_version" when a newer save landed first) so the
   * dialog can say which one happened instead of always blaming a takeover.
   */
  onConflict?: (reason?: string) => void
}

interface UseProjectAutosaveResult {
  status: AutosaveStatus
  /**
   * Send anything the server does not have NOW and wait for the PATCH to land:
   * a pending debounce fires, a save already on the wire is awaited, and content
   * that never made it (the debounce was cancelled, or the last attempt failed)
   * is sent. Resolves at once when the server already has what we hold. REJECTS
   * when the save fails — the caller decides what that means (the exit path
   * refuses to hand back the lease), and the next call retries.
   */
  flush: () => Promise<void>
}

/**
 * Debounced autosave for a project's dbml_text (and optional layout).
 * features layer: composes the project entity mutation + the shared debounce
 * hook (FSD downward imports).
 *
 * Saves ONLY on genuine user edits: it skips the mount render, skips while
 * dbmlText equals the server baseline (so the seed and a project re-seed never
 * save), and on a projectId change it cancels any pending save and re-arms so a
 * stale PATCH can't fire against the previous project.
 *
 * `flush()` is the imperative escape hatch: it sends whatever the server does
 * not have — a pending debounce, a cancelled one, or a save that failed — and
 * waits for it, so leaving edit mode cannot drop the last edit (ADR-0027).
 */
export function useProjectAutosave({
  projectId,
  dbmlText,
  layout,
  baseline,
  layoutBaseline,
  delayMs = 600,
  suspended = false,
  version,
  onConflict,
}: UseProjectAutosaveOptions): UseProjectAutosaveResult {
  const updateMutation = useUpdateProject(projectId)
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const mountedRef = useRef(false)
  const aliveRef = useRef(true)
  // Read at fire time so the debounced closure always sends the latest values.
  const versionRef = useRef(version)
  versionRef.current = version
  const onConflictRef = useRef(onConflict)
  onConflictRef.current = onConflict

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Serialize once per render so the change-detector compares by VALUE, not
  // object identity. An inline/new-identity layout object must not loop the save.
  const layoutKey = useMemo(() => JSON.stringify(layout ?? null), [layout])
  const layoutBaselineKey = useMemo(
    () => JSON.stringify(layoutBaseline ?? null),
    [layoutBaseline],
  )

  // Diverged from the server-seeded baselines? Fire if dbml diverged OR layout
  // diverged; skip when BOTH match (covers the seed + re-seed for both inputs).
  // When baseline is undefined (no dbml seed) keep the legacy "always save on
  // dbml change" behavior; layout only counts when a layoutBaseline is supplied
  // AND its serialized value diverged.
  const dbmlChanged = baseline === undefined || dbmlText !== baseline
  const layoutChanged = layoutBaseline !== undefined && layoutKey !== layoutBaselineKey
  const divergedFromSeed = dbmlChanged || layoutChanged

  // Everything a PATCH carries, by value — one string so "is this what the
  // server has?" is a comparison and not a deep walk of the layout. The NUL
  // joiner can't appear in either half, so two different pairs can't collide.
  const contentKey = useMemo(() => `${dbmlText}\u0000${layoutKey}`, [dbmlText, layoutKey])
  // Read at flush time (which awaits, so a render may land in between).
  const contentKeyRef = useRef(contentKey)
  contentKeyRef.current = contentKey
  const divergedRef = useRef(divergedFromSeed)
  divergedRef.current = divergedFromSeed

  // The save currently in flight, so flush() can await a PATCH the debounce
  // already fired instead of sending a second one. Cleared when it settles: a
  // dead promise would let a later flush "await" a save that is long over.
  const inFlightRef = useRef<Promise<unknown> | null>(null)
  // The content of the last PATCH that actually landed. Together with the
  // baseline it answers what the server holds, so flush() can tell a save it
  // still owes from one it already made.
  const lastPersistedRef = useRef<string | null>(null)
  // Which save is the newest: two can overlap (flush() sends while a debounced
  // PATCH is still on the wire), and only the newest one's content may be
  // recorded as persisted — an older reply landing last must not overwrite it.
  const saveSeqRef = useRef(0)

  /**
   * We hold content the server does not have: it diverged from the seed AND is
   * not what the last successful save carried. Re-seeding (project switch, or
   * the resync on entering edit mode) clears this by moving the baseline, so a
   * key left over from an earlier session can't provoke a save.
   */
  const isDirty = useCallback(
    () => divergedRef.current && contentKeyRef.current !== lastPersistedRef.current,
    [],
  )

  const runSave = useCallback((): Promise<unknown> => {
    setStatus('saving')
    const sent = contentKey
    const seq = (saveSeqRef.current += 1)
    const promise = updateMutation
      .mutateAsync({
        dbml_text: dbmlText,
        layout: layout as Record<string, unknown> | undefined,
        version: versionRef.current,
      })
      .then(
        (result) => {
          if (seq === saveSeqRef.current) lastPersistedRef.current = sent
          if (aliveRef.current) setStatus('saved')
          return result
        },
        (error: unknown) => {
          if (aliveRef.current) setStatus('error')
          // 409 = edit lock taken over or stale version → let the editor react.
          if (error instanceof ApiError && error.status === 409) {
            onConflictRef.current?.(error.reason)
          }
          throw error
        },
      )
    inFlightRef.current = promise
    // Settled either way = no longer in flight. `.then(f, f)` handles the
    // rejection, so this bookkeeping never surfaces as an unhandled one.
    const clear = () => {
      if (inFlightRef.current === promise) inFlightRef.current = null
    }
    void promise.then(clear, clear)
    return promise
  }, [updateMutation, dbmlText, layout, contentKey])

  const debouncedSave = useDebouncedCallback(() => {
    // The automatic path reports failure through `status` / onConflict; swallow
    // the rejection here so it never surfaces as an unhandled promise.
    void runSave().catch(() => {})
  }, delayMs)

  // Read at flush time so the stable flush() always runs the freshest payload.
  const runSaveRef = useRef(runSave)
  runSaveRef.current = runSave

  const flush = useCallback(async () => {
    // Fires the pending call synchronously, which sets inFlightRef.
    debouncedSave.flush()
    // Wait out whatever is on the wire — it may be the very save we owe.
    if (inFlightRef.current) await inFlightRef.current
    // Still holding what the server never acknowledged? Send it now. This is
    // what makes a retry after a failed save actually re-send (ADR-0027), and
    // what covers content whose debounce was cancelled (a snapshot preview).
    if (isDirty()) await runSaveRef.current()
  }, [debouncedSave, isDirty])

  // Re-arm on project switch: drop any pending save (it would PATCH the old
  // project) and treat the next render's seed as a fresh mount, not an edit.
  useEffect(() => {
    mountedRef.current = false
    return () => {
      debouncedSave.cancel()
    }
  }, [projectId, debouncedSave])

  useEffect(() => {
    // Paused (e.g. snapshot preview open): drop any pending save and never fire.
    if (suspended) {
      debouncedSave.cancel()
      return
    }
    // Skip the first run after mount/switch: only autosave after a real edit.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (!divergedFromSeed) {
      return
    }
    debouncedSave()
    // dbmlText/layoutKey stay in the deps so every keystroke and every drag
    // re-arms the timer, not only the edit that first diverged.
  }, [dbmlText, layoutKey, divergedFromSeed, debouncedSave, suspended])

  return { status, flush }
}
