import { useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { useUpdateProject } from '@/entities/project'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseProjectAutosaveOptions {
  projectId: string
  dbmlText: string
  layout?: Record<string, unknown>
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
 * Watches dbmlText/layout; on change (NOT on mount) it debounces ~600ms then
 * PATCHes the project. Exposes a status the editor can show. It never saves on
 * the initial render: a mounted ref gates the watcher's first effect run.
 */
export function useProjectAutosave({
  projectId,
  dbmlText,
  layout,
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

  useEffect(() => {
    // Skip the first run (mount): only autosave after the user edits a value.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    debouncedSave()
  }, [dbmlText, layout, debouncedSave])

  return { status }
}
