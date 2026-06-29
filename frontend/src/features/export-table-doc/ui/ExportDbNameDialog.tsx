import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export interface ExportDbNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Run the export with the entered default DB name (trimmed; '' when left
   * blank). The dialog closes itself before calling this.
   */
  onConfirm: (defaultDbName: string) => void
}

/**
 * Small prompt shown before an Excel 테이블 정의서 export to collect a default
 * DB name — the value fills every blank "DB 명" cell (DBML carries no DB-name
 * concept, so those cells are otherwise empty). Leaving it blank exports them
 * empty (prior behavior). Shared by the topbar Export menu and the preview
 * overlay so both Excel triggers prompt identically (G1 single source).
 */
export function ExportDbNameDialog({ open, onOpenChange, onConfirm }: ExportDbNameDialogProps) {
  const { t } = useTranslation()
  const [dbName, setDbName] = useState('')

  function confirm() {
    onOpenChange(false)
    onConfirm(dbName.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="export-dbname-dialog">
        <DialogHeader>
          <DialogTitle>{t('tableDoc.dbNamePromptTitle')}</DialogTitle>
          <DialogDescription>{t('tableDoc.dbNamePromptDesc')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirm()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-dbname-input">{t('tableDoc.dbName')}</Label>
            <Input
              id="export-dbname-input"
              data-testid="export-dbname-input"
              autoFocus
              value={dbName}
              placeholder={t('tableDoc.dbNamePromptPlaceholder')}
              onChange={(e) => setDbName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" data-testid="export-dbname-confirm">
              {t('exportMenu.export')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
