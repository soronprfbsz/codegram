import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dialog title (already-translated string). */
  title: string
  /** Body text / warning (already-translated). */
  description?: ReactNode
  /** Confirm button label; defaults to common.delete. */
  confirmLabel?: string
  /** Cancel button label; defaults to common.cancel. */
  cancelLabel?: string
  /** Confirm handler. The dialog closes itself before calling this. */
  onConfirm: () => void
  /** Style the confirm button as destructive (red). Default true. */
  destructive?: boolean
  /** Disable the confirm button (e.g. while a mutation is pending). */
  confirmDisabled?: boolean
  /** Stable testid prefix → `${testId}` on content, `${testId}-ok` on confirm. */
  testId?: string
}

/**
 * App-wide confirmation modal — the single source for "정말 하시겠습니까?" style
 * prompts (especially irreversible/destructive deletes). NEVER use the native
 * `window.confirm` for these; use this so the look matches the rest of the app
 * and copy is i18n-managed (F1/F4/G1).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = true,
  confirmDisabled = false,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            data-testid={`${testId}-ok`}
            disabled={confirmDisabled}
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel ?? t('common.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
