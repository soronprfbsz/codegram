import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { useAdminContacts } from '@/entities/account'

/**
 * Login-screen "비밀번호 초기화" guidance: a trigger that reveals the public
 * admin-contact list (unauthenticated) so a locked-out user knows who to ask.
 */
export function PasswordResetHelp() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: admins, isLoading } = useAdminContacts()

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {t('auth.forgotPassword')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="password-reset-help">
          <DialogHeader>
            <DialogTitle>{t('auth.forgotPasswordTitle')}</DialogTitle>
            <DialogDescription>
              {t('auth.forgotPasswordDescription')}
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('auth.adminContactsLoading')}
            </p>
          ) : admins && admins.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {admins.map((admin) => (
                <li key={admin.email}>{admin.email}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('auth.adminContactsEmpty')}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
