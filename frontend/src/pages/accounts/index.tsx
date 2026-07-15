import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import {
  useAccounts,
  useMe,
  useUpdateAccountRole,
  useResetPassword,
  type Account,
  type RoleName,
} from '@/entities/account'

const ROLE_OPTIONS: RoleName[] = ['admin', 'user']

/** One account row: read-only email/role, or (with user:manage) an editable
 * role select + a reset-password button that reveals the one-time temp
 * password in a copyable modal. */
function AccountRow({
  account,
  canManage,
}: {
  account: Account
  canManage: boolean
}) {
  const { t } = useTranslation()
  const updateRole = useUpdateAccountRole()
  const resetPassword = useResetPassword()
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleReset() {
    const result = await resetPassword.mutateAsync(account.id)
    setTempPassword(result.temp_password)
    setCopied(false)
  }

  function handleCopy() {
    if (!tempPassword) return
    navigator.clipboard?.writeText(tempPassword)
    setCopied(true)
  }

  return (
    <li
      data-testid={`account-row-${account.id}`}
      className={
        canManage
          ? 'grid grid-cols-[1fr_160px_140px] items-center gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0'
          : 'grid grid-cols-[1fr_160px] items-center gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0'
      }
    >
      <span className="truncate">{account.email}</span>
      {canManage ? (
        <Select
          aria-label={t('accounts.roleSelectAria', { email: account.email })}
          data-testid={`account-role-select-${account.id}`}
          value={account.role_name ?? 'user'}
          disabled={updateRole.isPending}
          onChange={(e) =>
            updateRole.mutate({
              accountId: account.id,
              roleName: e.target.value,
            })
          }
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {t(`accounts.role${role === 'admin' ? 'Admin' : 'User'}`)}
            </option>
          ))}
        </Select>
      ) : (
        <span>
          {account.role_name === 'admin'
            ? t('accounts.roleAdmin')
            : account.role_name === 'user'
              ? t('accounts.roleUser')
              : t('accounts.roleUnknown')}
        </span>
      )}
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          data-testid={`account-reset-button-${account.id}`}
          aria-label={t('accounts.resetPasswordAria', {
            email: account.email,
          })}
          disabled={resetPassword.isPending}
          onClick={handleReset}
        >
          {resetPassword.isPending
            ? t('accounts.resetPasswordPending')
            : t('accounts.resetPassword')}
        </Button>
      )}

      <Dialog
        open={tempPassword !== null}
        onOpenChange={(open) => !open && setTempPassword(null)}
      >
        <DialogContent data-testid="account-reset-modal">
          <DialogHeader>
            <DialogTitle>{t('accounts.resetModalTitle')}</DialogTitle>
            <DialogDescription>
              {t('accounts.resetModalDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-2.5 py-1.5 font-mono text-sm">
            <span
              data-testid="account-reset-temp-password"
              className="flex-1 select-all"
            >
              {tempPassword}
            </span>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? t('accounts.copied') : t('accounts.copy')}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setTempPassword(null)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** Account management page: everyone with user:read sees the list; only
 * user:manage additionally sees the role select + reset-password controls
 * (ADR-0016). The "권한 관리" matrix tab is a later task. */
export function AccountsPage() {
  const { t } = useTranslation()
  const { data: accounts } = useAccounts()
  const { data: me } = useMe()
  const canManage = me?.permissions.includes('user:manage') ?? false

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-medium">
            {t('accounts.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('accounts.subtitle')}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div
            className={
              canManage
                ? 'grid grid-cols-[1fr_160px_140px] gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'
                : 'grid grid-cols-[1fr_160px] gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'
            }
          >
            <span>{t('accounts.columnEmail')}</span>
            <span>{t('accounts.columnRole')}</span>
          </div>
          <ul>
            {(accounts ?? []).map((a) => (
              <AccountRow key={a.id} account={a} canManage={canManage} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
