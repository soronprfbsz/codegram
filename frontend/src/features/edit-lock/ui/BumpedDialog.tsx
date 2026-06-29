import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'

export interface BumpedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current DBML, offered for copy-out so unsaved work isn't silently lost. */
  dbmlText: string
}

/**
 * Shown when the caller's edit lock was taken over (force/expiry) and their
 * write was rejected: their unsaved changes won't persist, so offer to copy the
 * current DBML out before reloading to the latest server state (ADR-0015).
 */
export function BumpedDialog({ open, onOpenChange, dbmlText }: BumpedDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-lock-bumped">
        <DialogHeader>
          <DialogTitle>{t('editLock.bumpedTitle')}</DialogTitle>
          <DialogDescription>{t('editLock.bumpedDesc')}</DialogDescription>
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
