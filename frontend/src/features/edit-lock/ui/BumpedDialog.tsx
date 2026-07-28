import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import type { EditConflictReason } from '../model/types'

export interface BumpedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current DBML, offered for copy-out so unsaved work isn't silently lost. */
  dbmlText: string
  /** Which 409 this was; decides the copy. Defaults to a lease takeover. */
  reason?: EditConflictReason | null
}

/**
 * Shown when a content write came back 409 and the caller's changes did not
 * persist: offer to copy the current DBML out before reloading to the latest
 * server state (ADR-0015).
 *
 * The two reasons must not be conflated — telling someone "another user took
 * over" when nobody did (their window was just out of date) sends them looking
 * for a colleague who never touched the project.
 */
export function BumpedDialog({
  open,
  onOpenChange,
  dbmlText,
  reason = 'edit_locked',
}: BumpedDialogProps) {
  const { t } = useTranslation()
  const stale = reason === 'stale_version'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-lock-bumped">
        <DialogHeader>
          <DialogTitle>
            {t(stale ? 'editLock.staleTitle' : 'editLock.bumpedTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(stale ? 'editLock.staleDesc' : 'editLock.bumpedDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="edit-lock-copy"
            onClick={() => void navigator.clipboard?.writeText(dbmlText)}
          >
            {t('editLock.copyDbml')}
          </Button>
          <Button
            type="button"
            data-testid="edit-lock-reload"
            onClick={() => window.location.reload()}
          >
            {t('editLock.reload')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
