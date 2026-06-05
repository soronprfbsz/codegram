import { useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { useUpdateProject } from '@/entities/project'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseProjectAutosaveOptions {
  projectId: string
  dbmlText: string
  layout?: Record<string, unknown>
  /**
   * The last server-seeded value. Autosave never fires while dbmlText still
   * equals the baseline, so opening a project (the seed) and re-seeding on a
   * project switch don't trigger a PATCH — only genuine user edits do.
   */
  baseline?: string
  delayMs?: number
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
  delayMs = 600,
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

  const debouncedSave = useDebouncedCallback(() => {
    setStatus('saving')
    updateMutation.mutate(
      { dbml_text: dbmlText, layout },
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
    // Skip the first run after mount/switch: only autosave after a real edit.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    // Skip while the text still matches the server-seeded baseline (the seed
    // itself, and any re-seed, should never trigger a save).
    if (baseline !== undefined && dbmlText === baseline) {
      return
    }
    debouncedSave()
  }, [dbmlText, layout, baseline, debouncedSave])

  return { status }
}
