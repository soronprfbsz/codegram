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

export interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Headline (already-translated string). */
  title: string
  /** What happened / what to do about it (already-translated). */
  description?: ReactNode
  /** Dismiss button label; defaults to common.close. */
  closeLabel?: string
  /** Stable testid prefix → `${testId}` on content, `${testId}-ok` on dismiss. */
  testId?: string
}

/**
 * App-wide notice modal — the single source for "이 작업은 실패했습니다" style
 * messages the user only needs to acknowledge. Sibling of ConfirmDialog: same
 * surface and copy handling, but one button and no decision to make. Use this
 * instead of a bare `alert()` or a hand-rolled Dialog at the call site (F1/F4).
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  testId = 'alert-dialog',
}: AlertDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            data-testid={`${testId}-ok`}
            onClick={() => onOpenChange(false)}
          >
            {closeLabel ?? t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
