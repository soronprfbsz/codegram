import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateSnapshot } from '@/entities/snapshot'
import { useToast } from '@/shared/ui/toast'
import { ApiError } from '@/shared/api/client'

interface UseManualSaveOptions {
  projectId: string
  /** Owner/editor. False for viewers — no shortcut is registered at all. */
  canEdit: boolean
  /** Saving is possible right now: !readOnly && !previewing. */
  editable: boolean
  /**
   * Push any pending autosave to the server and wait for it. Injected by the
   * page: this feature must not import another feature (FSD).
   */
  flush: () => Promise<void>
}

interface UseManualSaveResult {
  /** Save now and record a checkpoint. Safe to call while one is running. */
  save: () => Promise<void>
  saving: boolean
}

/**
 * Explicit save (Ctrl+S): flush the pending autosave, then record the moment as
 * a `checkpoint` snapshot (ADR-0027). Autosave already keeps the server current
 * — what this adds is a point in the version history the user chose.
 *
 * The listener is on `window` so it also fires with focus inside the Monaco
 * DBML editor, and it preventDefaults so the browser's "save page" never opens.
 */
export function useManualSave({
  projectId,
  canEdit,
  editable,
  flush,
}: UseManualSaveOptions): UseManualSaveResult {
  const { t } = useTranslation()
  const toast = useToast()
  const createSnapshot = useCreateSnapshot(projectId)
  const [saving, setSaving] = useState(false)
  // A ref as well as state: the keydown handler must see the current value
  // synchronously to drop a repeat press before a re-render lands.
  const savingRef = useRef(false)

  const save = useCallback(async () => {
    if (savingRef.current) return
    if (!editable) {
      toast.info(t('toast.editModeRequired'))
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      // Order matters: the snapshot copies the project row on the SERVER, so
      // the PATCH has to land first or the checkpoint misses the last edit.
      await flush()
      await createSnapshot.mutateAsync({ kind: 'checkpoint' })
      toast.success(t('toast.saved'))
    } catch (error) {
      // A 409 means the lease was taken or the version moved on — autosave's
      // onConflict already raises the conflict dialog for that, so a toast here
      // would say the same thing twice.
      if (!(error instanceof ApiError && error.status === 409)) {
        toast.error(t('toast.saveFailed'))
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [editable, flush, createSnapshot, toast, t])

  // Keep the listener stable while always calling the freshest save().
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit])

  return { save, saving }
}
