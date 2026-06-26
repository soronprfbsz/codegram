import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { useUpdateProject } from '@/entities/project'
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
   * While true (e.g. a snapshot preview is open), autosave is paused: no PATCH
   * fires and any already-debounced save is cancelled. Prevents a read-only
   * preview's swapped-in content from being persisted as the current state.
   */
  suspended?: boolean
}

interface UseProjectAutosaveResult {
  status: AutosaveStatus
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
 */
export function useProjectAutosave({
  projectId,
  dbmlText,
  layout,
  baseline,
  layoutBaseline,
  delayMs = 600,
  suspended = false,
}: UseProjectAutosaveOptions): UseProjectAutosaveResult {
  const updateMutation = useUpdateProject(projectId)
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const mountedRef = useRef(false)
  const aliveRef = useRef(true)

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

  const debouncedSave = useDebouncedCallback(() => {
    setStatus('saving')
    updateMutation.mutate(
      { dbml_text: dbmlText, layout: layout as Record<string, unknown> | undefined },
      {
        onSuccess: () => {
          if (aliveRef.current) {
            setStatus('saved')
          }
        },
        onError: () => {
          if (aliveRef.current) {
            setStatus('error')
          }
        },
      },
    )
  }, delayMs)

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
    // Fire if dbml diverged from its baseline OR layout diverged from its
    // baseline; skip when BOTH match (covers the seed + re-seed for both
    // inputs). When baseline is undefined (no dbml seed) keep the legacy
    // "always save on dbml change" behavior; layout only fires when a
    // layoutBaseline is supplied AND its serialized value diverged.
    const dbmlChanged = baseline === undefined || dbmlText !== baseline
    const layoutChanged =
      layoutBaseline !== undefined && layoutKey !== layoutBaselineKey
    if (!dbmlChanged && !layoutChanged) {
      return
    }
    debouncedSave()
  }, [dbmlText, baseline, layoutKey, layoutBaselineKey, debouncedSave, suspended])

  return { status }
}
